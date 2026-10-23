require('dotenv/config');
const {S3Client, GetPublicAccessBlockCommand, GetBucketVersioningCommand, GetBucketEncryptionCommand, GetBucketOwnershipControlsCommand} = require('@aws-sdk/client-s3');
const bucket = 'zenex-international-mrpob';
const client = new S3Client({region: 'ap-southeast-2'});
async function main() {
  const [access, versioning, encryption, ownership] = await Promise.all([
    client.send(new GetPublicAccessBlockCommand({Bucket: bucket})),
    client.send(new GetBucketVersioningCommand({Bucket: bucket})),
    client.send(new GetBucketEncryptionCommand({Bucket: bucket})),
    client.send(new GetBucketOwnershipControlsCommand({Bucket: bucket})),
  ]);
  const block = access.PublicAccessBlockConfiguration || {};
  const checks = {
    blockPublicAccess: ['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'].every(key => block[key] === true),
    versioningEnabled: versioning.Status === 'Enabled',
    defaultEncryptionEnabled: Boolean(encryption.ServerSideEncryptionConfiguration?.Rules?.length),
    bucketOwnerEnforced: ownership.OwnershipControls?.Rules?.some(rule => rule.ObjectOwnership === 'BucketOwnerEnforced') === true,
  };
  console.log(JSON.stringify(checks, null, 2));
  if (Object.values(checks).some(value => !value)) process.exitCode = 1;
}
main().catch(error => {console.error(`Storage configuration could not be verified (${error.name || 'unknown error'}). Use an operator role with bucket-configuration read permissions.`); process.exitCode = 1;}).finally(() => client.destroy());
