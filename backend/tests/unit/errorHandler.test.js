import { describe, expect, it, vi } from "vitest";
import { errorHandler, notFoundHandler } from "../../src/middleware/errorHandler.js";
import { AppError, badRequest } from "../../src/lib/errors.js";
import logger from "../../src/lib/logger.js";

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("middleware/errorHandler", () => {
  it("notFoundHandler devolve 404 padronizado", () => {
    const res = fakeRes();
    notFoundHandler({}, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Rota não encontrada" } });
  });

  it("erros de aplicacao (AppError) usam o status/codigo proprios", () => {
    const res = fakeRes();
    const error = badRequest("Dados inválidos", { campo: "nome" });
    errorHandler(error, {}, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatchObject({ code: "BAD_REQUEST", message: "Dados inválidos" });
  });

  it("P2002 (duplicado) vira 409 com o campo do meta.target", () => {
    const res = fakeRes();
    errorHandler({ code: "P2002", meta: { target: ["email"] } }, {}, res, () => {});
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatchObject({ code: "CONFLICT", details: ["email"] });
  });

  it("P2002 sem meta usa details nulo", () => {
    const res = fakeRes();
    errorHandler({ code: "P2002" }, {}, res, () => {});
    expect(res.body.error.details).toBeNull();
  });

  it("P2025 (registro nao encontrado) vira 404", () => {
    const res = fakeRes();
    errorHandler({ code: "P2025" }, {}, res, () => {});
    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("P2003 (violacao de FK) vira 409 com o nome do campo", () => {
    const res = fakeRes();
    errorHandler({ code: "P2003", meta: { field_name: "gameId" } }, {}, res, () => {});
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatchObject({ code: "CONFLICT", details: "gameId" });
  });

  it("P2003 sem meta usa details nulo", () => {
    const res = fakeRes();
    errorHandler({ code: "P2003" }, {}, res, () => {});
    expect(res.body.error.details).toBeNull();
  });

  it("INVALID_ROUND_TRANSITION vira 409 preservando a mensagem", () => {
    const res = fakeRes();
    errorHandler(
      { code: "INVALID_ROUND_TRANSITION", message: "Transição inválida" },
      {},
      res,
      () => {},
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toEqual({ code: "INVALID_ROUND_TRANSITION", message: "Transição inválida" });
  });

  it("erro desconhecido vira 500 e é logado", () => {
    const res = fakeRes();
    const spy = vi.spyOn(logger, "error").mockImplementation(() => {});
    errorHandler(new Error("algo quebrou"), {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("AppError.toJSON() expõe code/message/details", () => {
    const error = new AppError("mensagem", { status: 422, code: "UNPROCESSABLE", details: { a: 1 } });
    expect(error.toJSON()).toEqual({
      error: { code: "UNPROCESSABLE", message: "mensagem", details: { a: 1 } },
    });
  });
});
