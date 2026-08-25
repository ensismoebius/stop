import prisma from "../lib/prisma.js";

export const categorySetRepository = {
  list: ({ onlyActive = false } = {}) =>
    prisma.categorySet.findMany({
      where: onlyActive ? { active: true } : {},
      orderBy: { name: "asc" },
      include: {
        categories: { orderBy: { order: "asc" } },
      },
    }),

  findById: (id) =>
    prisma.categorySet.findUnique({
      where: { id },
      include: { categories: { orderBy: { order: "asc" } } },
    }),

  create: (data) => prisma.categorySet.create({ data, include: { categories: true } }),

  update: (id, data) =>
    prisma.categorySet.update({ where: { id }, data, include: { categories: true } }),

  remove: (id) => prisma.categorySet.delete({ where: { id } }),
};

export const categoryRepository = {
  list: (categorySetId) =>
    prisma.category.findMany({
      where: categorySetId ? { categorySetId } : {},
      orderBy: [{ categorySetId: "asc" }, { order: "asc" }],
    }),

  findById: (id) => prisma.category.findUnique({ where: { id } }),

  create: (data) => prisma.category.create({ data }),

  update: (id, data) => prisma.category.update({ where: { id }, data }),

  remove: (id) => prisma.category.delete({ where: { id } }),
};

export default categorySetRepository;
