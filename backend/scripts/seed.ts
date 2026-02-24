import * as bcrypt from 'bcryptjs';
import { APP_ROLE } from '@votes/shared';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || 'Admin';

  if (!adminEmail || !adminPassword) {
    console.log('ADMIN_EMAIL or ADMIN_PASSWORD not set. Skipping admin user seed.');
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, name: adminName, role: APP_ROLE.ADMIN },
    create: { email: adminEmail, passwordHash, name: adminName, role: APP_ROLE.ADMIN },
  });

  console.log('Seed complete');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
