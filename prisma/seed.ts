import prisma from "../lib/prisma";

import bcrypt from "bcryptjs";

async function main() {
  // 1️⃣ Create an organization
  const org = await prisma.organization.create({
    data: { name: "MASA Corp" },
  });

  // 2️⃣ Create a branch
  const branch = await prisma.branch.create({
    data: { name: "Main Branch", organizationId: org.id },
  });

  // 3️⃣ Create an admin personnel
  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.authorizedPersonnel.create({
    data: {
      name: "Admin User",
      email: "admin@masa.com",
      password: passwordHash,
      organizationId: org.id,
      branchId: branch.id,
    },
  });

  // 4️⃣ Assign role via BranchAssignment
  await prisma.branchAssignment.create({
    data: {
      personnelId: admin.id,
      branchId: branch.id,
      role: "ADMIN",
    },
  });

  console.log("✅ Seed complete");
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
