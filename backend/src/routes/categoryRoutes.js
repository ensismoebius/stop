import { Router } from "express";
import { categoryController, categorySetController } from "../controllers/categoryController.js";
import { requireTeacher } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  categorySchema,
  categorySetSchema,
  categorySetUpdateSchema,
  categoryUpdateSchema,
} from "../validators/schemas.js";

const router = Router();

router.use("/category-sets", requireTeacher);
router.get("/category-sets", categorySetController.list);
router.get("/category-sets/:id", categorySetController.get);
router.post("/category-sets", validateBody(categorySetSchema), categorySetController.create);
router.patch("/category-sets/:id", validateBody(categorySetUpdateSchema), categorySetController.update);
router.delete("/category-sets/:id", categorySetController.remove);

router.use("/categories", requireTeacher);
router.get("/categories", categoryController.list);
router.get("/categories/:id", categoryController.get);
router.post("/categories", validateBody(categorySchema), categoryController.create);
router.patch("/categories/:id", validateBody(categoryUpdateSchema), categoryController.update);
router.delete("/categories/:id", categoryController.remove);

export default router;
