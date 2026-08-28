import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../src/services/api.js";

/** Builds a minimal fetch Response-like stub from a JSON body. */
function jsonResponse(body, { status = 200, ok = true } = {}) {
  return {
    status,
    ok,
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api.request (low level)", () => {
  it("performs a GET with no body/content-type header", async () => {
    fetch.mockResolvedValue(jsonResponse({ ok: true }));
    const result = await api.request("/ping");
    expect(result).toEqual({ ok: true });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/ping");
    expect(options.method).toBe("GET");
    expect(options.headers["Content-Type"]).toBeUndefined();
    expect(options.body).toBeUndefined();
  });

  it("sends a JSON body with Content-Type on POST", async () => {
    fetch.mockResolvedValue(jsonResponse({ id: 1 }));
    await api.request("/things", { method: "POST", body: { name: "x" } });
    const [, options] = fetch.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.body).toBe(JSON.stringify({ name: "x" }));
  });

  it("attaches an Authorization bearer header for adminToken", async () => {
    fetch.mockResolvedValue(jsonResponse({}));
    await api.request("/secure", { adminToken: "admin-123" });
    const [, options] = fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer admin-123");
  });

  it("attaches an x-player-token header for playerToken", async () => {
    fetch.mockResolvedValue(jsonResponse({}));
    await api.request("/secure", { playerToken: "player-123" });
    const [, options] = fetch.mock.calls[0];
    expect(options.headers["x-player-token"]).toBe("player-123");
  });

  it("returns null for a 204 No Content response without reading the body", async () => {
    const text = vi.fn();
    fetch.mockResolvedValue({ status: 204, ok: true, text });
    const result = await api.request("/nothing");
    expect(result).toBeNull();
    expect(text).not.toHaveBeenCalled();
  });

  it("returns null when the response body is an empty string", async () => {
    fetch.mockResolvedValue({ status: 200, ok: true, text: () => Promise.resolve("") });
    const result = await api.request("/empty");
    expect(result).toBeNull();
  });

  it("throws an ApiError with details on a non-2xx JSON error response", async () => {
    fetch.mockResolvedValue(
      jsonResponse(
        { error: { message: "Não autorizado", code: "AUTH", details: { field: "token" } } },
        { status: 401, ok: false },
      ),
    );
    const promise = api.request("/secure");
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    try {
      await api.request("/secure");
    } catch (error) {
      expect(error.status).toBe(401);
      expect(error.code).toBe("AUTH");
      expect(error.message).toBe("Não autorizado");
      expect(error.details).toEqual({ field: "token" });
      expect(error.name).toBe("ApiError");
    }
  });

  it("falls back to a default error message when the body has no error.message", async () => {
    fetch.mockResolvedValue(jsonResponse({}, { status: 500, ok: false }));
    try {
      await api.request("/broken");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).toBe("Falha na requisicao");
      expect(error.code).toBeUndefined();
    }
  });

  it("falls back to a default error message when the body is empty on error", async () => {
    fetch.mockResolvedValue({ status: 500, ok: false, text: () => Promise.resolve("") });
    try {
      await api.request("/broken");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).toBe("Falha na requisicao");
    }
  });

  it("propagates network failures from fetch", async () => {
    fetch.mockRejectedValue(new Error("network down"));
    await expect(api.request("/x")).rejects.toThrow("network down");
  });
});

describe("api convenience methods", () => {
  beforeEach(() => {
    fetch.mockResolvedValue(jsonResponse({}));
  });

  it("login posts credentials", async () => {
    await api.login("a@b.com", "pw");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(JSON.parse(options.body)).toEqual({ email: "a@b.com", password: "pw" });
  });

  it("me sends the admin token", async () => {
    await api.me("tok");
    const [, options] = fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer tok");
  });

  it("listStudents omits the query string when no classId given", async () => {
    await api.listStudents("tok");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/students");
  });

  it("listStudents includes classId in the query string when given", async () => {
    await api.listStudents("tok", "class-1");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/students?classId=class-1");
  });

  it("deleteClass issues a DELETE", async () => {
    await api.deleteClass("tok", "c1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/classes/c1");
    expect(options.method).toBe("DELETE");
  });

  it("updateCategorySet issues a PATCH with a body", async () => {
    await api.updateCategorySet("tok", "cs1", { name: "Novo" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/category-sets/cs1");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ name: "Novo" });
  });

  it("createRoom posts to the game's rooms endpoint", async () => {
    await api.createRoom("tok", "game1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/games/game1/rooms");
    expect(options.method).toBe("POST");
  });

  it("reviewAnswer PATCHes a reviewState body", async () => {
    await api.reviewAnswer("tok", "ans1", "VALID");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/answers/ans1");
    expect(JSON.parse(options.body)).toEqual({ reviewState: "VALID" });
  });

  it("reviewAnswers posts a bulk reviews body", async () => {
    await api.reviewAnswers("tok", [{ id: "a1", reviewState: "VALID" }]);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/answers/bulk-review");
    expect(JSON.parse(options.body)).toEqual({ reviews: [{ id: "a1", reviewState: "VALID" }] });
  });

  it("nextRound posts a body to the game's next-round endpoint", async () => {
    await api.nextRound("tok", "game1", { categorySetId: "cs1" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/games/game1/rounds/next");
    expect(JSON.parse(options.body)).toEqual({ categorySetId: "cs1" });
  });

  it("searchReports builds a query string, skipping empty/null/undefined filters", async () => {
    await api.searchReports("tok", { classId: "c1", studentId: "", gameId: null, page: undefined });
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/reports/results?classId=c1");
  });

  it("searchReports omits the query string entirely when no filters given", async () => {
    await api.searchReports("tok");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/reports/results");
  });

  it("categoryStats builds a query string from filters", async () => {
    await api.categoryStats("tok", { classId: "c1", categorySetId: "cs1" });
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/reports/category-stats?classId=c1&categorySetId=cs1");
  });

  it("categoryStats omits the query string when no filters given", async () => {
    await api.categoryStats("tok");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/reports/category-stats");
  });

  it("getStudentHistory encodes the registration number in the URL", async () => {
    await api.getStudentHistory("12/34 5");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe(`/api/students/history/${encodeURIComponent("12/34 5")}`);
  });

  it("getRoom fetches a room by code with no auth headers", async () => {
    await api.getRoom("ABCD");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rooms/ABCD");
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.headers["x-player-token"]).toBeUndefined();
  });

  it("identify posts the registration number", async () => {
    await api.identify("ABCD", "123");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rooms/ABCD/identify");
    expect(JSON.parse(options.body)).toEqual({ registrationNumber: "123" });
  });

  it("join posts the registration number", async () => {
    await api.join("ABCD", "123");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rooms/ABCD/join");
    expect(JSON.parse(options.body)).toEqual({ registrationNumber: "123" });
  });

  it("setAvatar posts registrationNumber and avatarUrl", async () => {
    await api.setAvatar("ABCD", "123", "face:v1:02111002203202052");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rooms/ABCD/avatar");
    expect(JSON.parse(options.body)).toEqual({
      registrationNumber: "123",
      avatarUrl: "face:v1:02111002203202052",
    });
  });

  it("playerState sends the player token header", async () => {
    await api.playerState("ABCD", "ptok");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rooms/ABCD/me");
    expect(options.headers["x-player-token"]).toBe("ptok");
  });

  it("publicState fetches the public room state with no auth", async () => {
    await api.publicState("ABCD");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rooms/ABCD/public-state");
    expect(options.headers.Authorization).toBeUndefined();
  });

  it("usedLetters fetches a game's used letters", async () => {
    await api.usedLetters("tok", "game1");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/games/game1/letters");
  });

  it("deleteRound issues a DELETE to the nested round path", async () => {
    await api.deleteRound("tok", "game1", "round1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/games/game1/rounds/round1");
    expect(options.method).toBe("DELETE");
  });

  it("listClasses fetches with the admin token", async () => {
    await api.listClasses("tok");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/classes");
  });

  it("createClass posts a body", async () => {
    await api.createClass("tok", { name: "Turma A" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/classes");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ name: "Turma A" });
  });

  it("updateClass PATCHes a body", async () => {
    await api.updateClass("tok", "c1", { name: "Nova" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/classes/c1");
    expect(options.method).toBe("PATCH");
  });

  it("createStudent posts a body", async () => {
    await api.createStudent("tok", { name: "Aluno" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/students");
    expect(options.method).toBe("POST");
  });

  it("updateStudent PATCHes a body", async () => {
    await api.updateStudent("tok", "s1", { name: "Novo Nome" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/students/s1");
    expect(options.method).toBe("PATCH");
  });

  it("bulkStudents posts a body", async () => {
    await api.bulkStudents("tok", { students: [] });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/students/bulk");
    expect(options.method).toBe("POST");
  });

  it("deleteStudent issues a DELETE", async () => {
    await api.deleteStudent("tok", "s1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/students/s1");
    expect(options.method).toBe("DELETE");
  });

  it("listCategorySets fetches with the admin token", async () => {
    await api.listCategorySets("tok");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/category-sets");
  });

  it("createCategorySet posts a body", async () => {
    await api.createCategorySet("tok", { name: "Frutas" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/category-sets");
    expect(options.method).toBe("POST");
  });

  it("deleteCategorySet issues a DELETE", async () => {
    await api.deleteCategorySet("tok", "cs1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/category-sets/cs1");
    expect(options.method).toBe("DELETE");
  });

  it("createCategory posts a body", async () => {
    await api.createCategory("tok", { name: "Fruta" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/categories");
    expect(options.method).toBe("POST");
  });

  it("updateCategory PATCHes a body", async () => {
    await api.updateCategory("tok", "cat1", { required: false });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/categories/cat1");
    expect(options.method).toBe("PATCH");
  });

  it("deleteCategory issues a DELETE", async () => {
    await api.deleteCategory("tok", "cat1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/categories/cat1");
    expect(options.method).toBe("DELETE");
  });

  it("listGames fetches with the admin token", async () => {
    await api.listGames("tok");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/games");
  });

  it("createGame posts a body", async () => {
    await api.createGame("tok", { name: "Partida" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/games");
    expect(options.method).toBe("POST");
  });

  it("getGame fetches a single game", async () => {
    await api.getGame("tok", "g1");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/games/g1");
  });

  it("roomQrCode fetches the room's QR code", async () => {
    await api.roomQrCode("tok", "ABCD");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/rooms/ABCD/qrcode");
  });

  it("teacherState fetches a room's teacher-facing state", async () => {
    await api.teacherState("tok", "ABCD");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/rooms/ABCD/state");
  });

  it("gameScores fetches a game's scores", async () => {
    await api.gameScores("tok", "g1");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/games/g1/scores");
  });

  it("gameStatistics fetches a game's statistics", async () => {
    await api.gameStatistics("tok", "g1");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/games/g1/statistics");
  });

  it("gameHistory fetches a game's history", async () => {
    await api.gameHistory("tok", "g1");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/games/g1/history");
  });

  it("createRound posts a body", async () => {
    await api.createRound("tok", { gameId: "g1" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rounds");
    expect(options.method).toBe("POST");
  });

  it("drawLetter posts to a round's letter endpoint", async () => {
    await api.drawLetter("tok", "r1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rounds/r1/letter");
    expect(options.method).toBe("POST");
  });

  it("startRound posts to a round's start endpoint", async () => {
    await api.startRound("tok", "r1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rounds/r1/start");
    expect(options.method).toBe("POST");
  });

  it("stopRound posts to a round's stop endpoint", async () => {
    await api.stopRound("tok", "r1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rounds/r1/stop");
    expect(options.method).toBe("POST");
  });

  it("collaborativeCorrectionProgress fetches progress", async () => {
    await api.collaborativeCorrectionProgress("tok", "r1");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/rounds/r1/collaborative-correction");
  });

  it("finishCollaborativeCorrection posts to the finish endpoint", async () => {
    await api.finishCollaborativeCorrection("tok", "r1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rounds/r1/collaborative-correction/finish");
    expect(options.method).toBe("POST");
  });

  it("correctionGrid fetches the round's correction grid", async () => {
    await api.correctionGrid("tok", "r1");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/rounds/r1/correction");
  });

  it("groupedCorrectionGrid fetches the round's grouped correction grid", async () => {
    await api.groupedCorrectionGrid("tok", "r1");
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/rounds/r1/correction/grouped");
  });

  it("scoreRound posts to a round's score endpoint", async () => {
    await api.scoreRound("tok", "r1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rounds/r1/score");
    expect(options.method).toBe("POST");
  });

  it("finishRound posts to a round's finish endpoint", async () => {
    await api.finishRound("tok", "r1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rounds/r1/finish");
    expect(options.method).toBe("POST");
  });

  it("cancelRound posts to a round's cancel endpoint", async () => {
    await api.cancelRound("tok", "r1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/rounds/r1/cancel");
    expect(options.method).toBe("POST");
  });

  it("finishGame posts to a game's finish endpoint", async () => {
    await api.finishGame("tok", "g1");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/games/g1/finish");
    expect(options.method).toBe("POST");
  });
});
