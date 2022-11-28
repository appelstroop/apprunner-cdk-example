import * as cdk from "aws-cdk-lib";
import { CfnOutput, Duration } from "aws-cdk-lib";
import { CfnService, CfnVpcConnector } from "aws-cdk-lib/aws-apprunner";
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  Port,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import {
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  AuroraPostgresEngineVersion,
  DatabaseCluster,
  DatabaseClusterEngine,
} from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import { AppRunnerAutoScaling } from "./constructs/apprunner-autoscaling";

export class ApprunnerCdkExampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const repository = Repository.fromRepositoryName(
      this,
      "ApprunnerCdkExampleRepo",
      "example-repo"
    );

    const vpc = new Vpc(this, "ApprunnerCdkExampleVpc", {
      maxAzs: 2,
      natGateways: 1,
    });

    const dbCluster = new DatabaseCluster(
      this,
      "ApprunnerCdkExampleDBCluster",
      {
        engine: DatabaseClusterEngine.auroraPostgres({
          version: AuroraPostgresEngineVersion.VER_13_7,
        }),
        instances: 1,
        defaultDatabaseName: "postgres_api",
        instanceProps: {
          vpc: vpc,
          instanceType: InstanceType.of(
            InstanceClass.BURSTABLE3,
            InstanceSize.MEDIUM
          ),
          autoMinorVersionUpgrade: false,
          publiclyAccessible: false,
        },
        backup: {
          retention: Duration.days(7),
          preferredWindow: "01:00-02:00",
        },
        port: 5432,
        cloudwatchLogsRetention: RetentionDays.SIX_MONTHS,
        storageEncrypted: true,
        iamAuthentication: true,
      }
    );

    // set security group on DB cluster
    dbCluster.connections.allowFrom(dbCluster, Port.tcp(5432));

    const accessRole = new Role(this, "ApprunnerCdkExampleAccessRole", {
      assumedBy: new ServicePrincipal("build.apprunner.amazonaws.com"),
    });

    // make sure App Runner can pull from ECR
    accessRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:DescribeImages",
          "ecr:GetAuthorizationToken",
          "ecr:GetDownloadUrlForLayer",
        ],
        resources: ["*"],
      })
    );

    // VCP connector to connect AppRunner to our VPC (and therefore DB)
    const vpcConnector = new CfnVpcConnector(
      this,
      "ApprunnerCdkExampleVpcConnector",
      {
        subnets: vpc.selectSubnets({
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        }).subnetIds,
        securityGroups: [
          dbCluster.connections.securityGroups[0].securityGroupId,
        ],
      }
    );

    // allow the service to read from S3
    const instanceRole = new Role(this, "ApprunnerCdkExampleInstanceRole", {
      assumedBy: new ServicePrincipal("tasks.apprunner.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess"),
      ],
    });

    // embedding secrets in here is not secure. Use aws sdk to get secrets inside the container
    const envVars: Record<string, string> = {
      SOME_ENVIRONMENT_VAR: "xyz",
      ANOTHER_ENV: "miauw",
      FINAL_ONE: "bark",
    };
    const mappedEnvVars = Object.keys(envVars).map((key) => ({
      name: key,
      value: envVars[key],
    }));

    // Create autoscaling from custom construct
    const appRunnerAutoScaling = new AppRunnerAutoScaling(this, 'ApprunnerAutoscaling', {
      AutoScalingConfigurationName: 'apprunner-autoscaling',
      MinSize: 1,
      MaxSize: 3,
      MaxConcurrency: 100 // defines after how many concurrent requests app runner should scale up
    })

    const app = new CfnService(this, "ApprunnerCdkExampleService", {
      sourceConfiguration: {
        autoDeploymentsEnabled: true,
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: `${repository.repositoryUri}:latest`,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "80",
            runtimeEnvironmentVariables: mappedEnvVars,
          },
        },
      },
      healthCheckConfiguration: {
        unhealthyThreshold: 5,
        interval: 5,
      },
      // optional autoscalingconfiguration
      autoScalingConfigurationArn: appRunnerAutoScaling.autoScalingConfigurationArn,
      instanceConfiguration: {
        instanceRoleArn: instanceRole.roleArn,
      },
      networkConfiguration: {
        egressConfiguration: {
          egressType: "VPC",
          vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
        },
      },
    });

    // App Runner URL output
    new CfnOutput(this, "AppRunnerServiceUrl", {
      value: `https://${app.attrServiceUrl}`,
    });
  }
}
