# App Runner Cdk Example with VPC Connector

A cdk typescript example to deploy AWS App Runner with cdk and connect it to a VPC.

1. Make sure you create an ECR repo first and adjust the name accordingly in the stack. 
2. Adjust your account details in *bin/apprunner-cdk-example.ts*


## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
