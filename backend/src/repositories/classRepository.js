import prisma from "../lib/prisma.js";

export const classRepository = {
  list: () =>
    prisma.class.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { enrollments: true } } },
    }),

  findById: (id) =>
    prisma.class.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true } } },
    }),

  findByCode: (code) => prisma.class.findUnique({ where: { code } }),

  create: (data) => prisma.class.create({ data }),

  update: (id, data) => prisma.class.update({ where: { id }, data }),

  remove: (id) => prisma.class.delete({ where: { id } }),
};

export default classRepository;
