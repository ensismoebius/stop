import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const CATEGORY_SETS = [
  {
    name: "React Native — Componentes",
    description: "Componentes, props, eventos e bibliotecas do ecossistema.",
    categories: ["Componente", "Prop", "Evento", "API", "Biblioteca"],
  },
  {
    name: "React Hooks",
    description: "Hooks nativos, customizados e conceitos de estado e efeitos.",
    categories: [
      "Hook",
      "Hook nativo",
      "Hook customizado",
      "Conceito relacionado a estado",
      "Conceito relacionado a efeitos",
    ],
  },
  {
    name: "React Native — Navegação",
    description: "Navegadores, telas, métodos e props de navegação.",
    categories: ["Navigator", "Screen", "Hook", "Método", "Prop"],
  },
];

const STUDENTS = [
  ["202612345", "João da Silva"],
  ["202612346", "Maria Oliveira"],
  ["202612347", "Pedro Santos"],
  ["202612348", "Ana Souza"],
  ["202612349", "Carla Mendes"],
  ["202612350", "Bruno Almeida"],
  ["202612351", "Diego Ferreira"],
  ["202612352", "Elisa Rocha"],
];

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "professor@stop.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "stop-admin";
  const name = process.env.ADMIN_NAME ?? "Professor";

  const teacher = await prisma.teacher.upsert({
    where: { email },
    update: { name, active: true },
    create: { email, name, passwordHash: await bcrypt.hash(password, 10), role: "TEACHER" },
  });
  console.log(`Professor: ${teacher.email}`);

  const turma = await prisma.class.upsert({
    where: { code: "RN-2026-1" },
    update: {},
    create: { name: "React Native 2026/1", code: "RN-2026-1" },
  });

  for (const [registrationNumber, studentName] of STUDENTS) {
    const student = await prisma.student.upsert({
      where: { registrationNumber },
      update: { name: studentName, active: true },
      create: { registrationNumber, name: studentName },
    });
    await prisma.enrollment.upsert({
      where: { studentId_classId: { studentId: student.id, classId: turma.id } },
      update: {},
      create: { studentId: student.id, classId: turma.id },
    });
  }
  console.log(`Turma ${turma.code} com ${STUDENTS.length} alunos`);

  for (const set of CATEGORY_SETS) {
    const existing = await prisma.categorySet.findUnique({ where: { name: set.name } });
    if (existing) {
      console.log(`Conjunto ja existente: ${set.name}`);
      continue;
    }
    await prisma.categorySet.create({
      data: {
        name: set.name,
        description: set.description,
        categories: {
          create: set.categories.map((category, index) => ({
            name: category,
            required: true,
            order: index,
          })),
        },
      },
    });
    console.log(`Conjunto criado: ${set.name}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
