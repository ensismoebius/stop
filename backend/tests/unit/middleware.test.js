import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { requireTeacher } from "../../src/middleware/auth.js";
import authService from "../../src/services/authService.js";
import { validateBody, parseSocketPayload } from "../../src/middleware/validate.js";

describe("middleware/auth (spec 34/35)", () => {
  it("nega acesso a um token cujo perfil nao e administrativo", () => {
    const spy = vi.spyOn(authService, "verifyAdminToken").mockReturnValue({ id: 1, role: "STUDENT" });
    const next = vi.fn();
    requireTeacher({ headers: { authorization: "Bearer qualquer" } }, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: "FORBIDDEN" }));
    spy.mockRestore();
  });
});

describe("middleware/validate", () => {
  const schema = z.object({ a: z.string() });

  it("validateBody trata req.body ausente como objeto vazio (falha a validação)", () => {
    const next = vi.fn();
    validateBody(schema)({}, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it("parseSocketPayload trata payload ausente como objeto vazio", () => {
    const result = parseSocketPayload(schema, undefined);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
