import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { CreateAutoScalingConfigurationCommandInput } from "@aws-sdk/client-apprunner";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";

export class AppRunnerAutoScaling extends Construct {
  readonly autoScalingConfigurationArn: string;
  constructor(
    scope: Construct,
    id: string,
    autoScalingConfiguration: CreateAutoScalingConfigurationCommandInput
  ) {
    super(scope, id);

    const createAutoScalingConfiguration = new AwsCustomResource(
      this,
      "CreateAutoScalingConfiguration",
      {
        onCreate: {
          service: "AppRunner",
          action: "createAutoScalingConfiguration",
          parameters: autoScalingConfiguration,
          physicalResourceId: PhysicalResourceId.fromResponse(
            "AutoScalingConfiguration.AutoScalingConfigurationArn"
          ),
        },
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );

    const autoScalingConfigurationArn =
      createAutoScalingConfiguration.getResponseField(
        "AutoScalingConfiguration.AutoScalingConfigurationArn"
      );
    
    new AwsCustomResource(
      this,
      "DeleteAutoScalingConfiguration",
      {
        onDelete: {
          service: "AppRunner",
          action: "deleteAutoScalingConfiguration",
          parameters: {
            AutoScalingConfigurationArn: autoScalingConfigurationArn,
          },
        },
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );
    this.autoScalingConfigurationArn = autoScalingConfigurationArn;
  }
}
