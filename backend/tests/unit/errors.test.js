import { describe, expect, it } from "vitest";
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized, unprocessable } from "../../src/lib/errors.js";

describe("lib/errors (fábricas de AppError)", () => {
  it("cada fábrica usa o status/código esperado", () => {
    expect(badRequest("x")).toMatchObject({ status: 400, code: "BAD_REQUEST" });
    expect(unauthorized()).toMatchObject({ status: 401, code: "UNAUTHORIZED", message: "Não autenticado" });
    expect(forbidden()).toMatchObject({ status: 403, code: "FORBIDDEN", message: "Não autorizado" });
    expect(notFound()).toMatchObject({ status: 404, code: "NOT_FOUND", message: "Recurso não encontrado" });
    expect(conflict("y")).toMatchObject({ status: 409, code: "CONFLICT" });
    expect(unprocessable("z", { campo: 1 })).toMatchObject({
      status: 422,
      code: "UNPROCESSABLE",
      message: "z",
      details: { campo: 1 },
    });
  });

  it("é uma instância de AppError e de Error", () => {
    const error = unprocessable("falha semântica");
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });
});
