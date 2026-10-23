require('dotenv/config');
const {PrismaClient} = require('@prisma/client');
const {COGNITO_SUB, ERP_USERNAME, ERP_DISPLAY_NAME, ERP_ROLE = 'SUPER_ADMIN'} = process.env;
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(COGNITO_SUB || '')) throw new Error('COGNITO_SUB must be the verified existing Cognito user sub');
if (!ERP_USERNAME || !ERP_DISPLAY_NAME || !['ADMIN', 'SUPER_ADMIN'].includes(ERP_ROLE)) throw new Error('ERP_USERNAME, ERP_DISPLAY_NAME and ADMIN/SUPER_ADMIN ERP_ROLE are required');
const prisma = new PrismaClient();
async function main() {
  await prisma.$transaction(async tx => {
    const existing = await tx.erpUser.findUnique({where: {cognitoSub: COGNITO_SUB}});
    const account = await tx.erpUser.upsert({where: {cognitoSub: COGNITO_SUB}, create: {cognitoSub: COGNITO_SUB, username: ERP_USERNAME, displayName: ERP_DISPLAY_NAME, role: ERP_ROLE, state: 'ACTIVE'}, update: {username: ERP_USERNAME, displayName: ERP_DISPLAY_NAME, role: ERP_ROLE, state: 'ACTIVE'}});
    await tx.auditEvent.create({data: {actorId: account.id, action: existing ? 'ADMIN_ROLE_PROVISION_UPDATED' : 'ADMIN_ROLE_PROVISION_CREATED', detail: {role: ERP_ROLE, source: 'operator-provisioning-script'}}});
  });
  console.log('Existing Cognito subject mapped to an active ERP administrator. No Cognito account or password was created.');
}
main().catch(error => {console.error(error.code || 'Administrator provisioning failed'); process.exitCode = 1;}).finally(() => prisma.$disconnect());
