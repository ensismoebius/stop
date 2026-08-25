const BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = "GET", body, adminToken, playerToken } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  if (playerToken) headers["x-player-token"] = playerToken;

  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return null;

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = data?.error ?? {};
    throw new ApiError(error.message ?? "Falha na requisicao", {
      status: response.status,
      code: error.code,
      details: error.details,
    });
  }
  return data;
}

/** Cliente REST. O servidor continua sendo a autoridade de todo estado. */
export const api = {
  request,

  // Autenticacao administrativa (spec 35)
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  me: (adminToken) => request("/auth/me", { adminToken }),

  // Cadastros
  listClasses: (t) => request("/classes", { adminToken: t }),
  createClass: (t, body) => request("/classes", { method: "POST", body, adminToken: t }),
  updateClass: (t, id, body) => request(`/classes/${id}`, { method: "PATCH", body, adminToken: t }),
  deleteClass: (t, id) => request(`/classes/${id}`, { method: "DELETE", adminToken: t }),
  listStudents: (t, classId) =>
    request(`/students${classId ? `?classId=${classId}` : ""}`, { adminToken: t }),
  createStudent: (t, body) => request("/students", { method: "POST", body, adminToken: t }),
  updateStudent: (t, id, body) =>
    request(`/students/${id}`, { method: "PATCH", body, adminToken: t }),
  bulkStudents: (t, body) => request("/students/bulk", { method: "POST", body, adminToken: t }),
  deleteStudent: (t, id) => request(`/students/${id}`, { method: "DELETE", adminToken: t }),
  listCategorySets: (t) => request("/category-sets", { adminToken: t }),
  createCategorySet: (t, body) => request("/category-sets", { method: "POST", body, adminToken: t }),
  updateCategorySet: (t, id, body) =>
    request(`/category-sets/${id}`, { method: "PATCH", body, adminToken: t }),
  deleteCategorySet: (t, id) => request(`/category-sets/${id}`, { method: "DELETE", adminToken: t }),
  createCategory: (t, body) => request("/categories", { method: "POST", body, adminToken: t }),
  updateCategory: (t, id, body) =>
    request(`/categories/${id}`, { method: "PATCH", body, adminToken: t }),
  deleteCategory: (t, id) => request(`/categories/${id}`, { method: "DELETE", adminToken: t }),

  // Partidas e salas
  listGames: (t) => request("/games", { adminToken: t }),
  createGame: (t, body) => request("/games", { method: "POST", body, adminToken: t }),
  getGame: (t, id) => request(`/games/${id}`, { adminToken: t }),
  createRoom: (t, gameId) => request(`/games/${gameId}/rooms`, { method: "POST", adminToken: t }),
  roomQrCode: (t, code) => request(`/rooms/${code}/qrcode`, { adminToken: t }),
  teacherState: (t, code) => request(`/rooms/${code}/state`, { adminToken: t }),
  gameScores: (t, id) => request(`/games/${id}/scores`, { adminToken: t }),
  gameStatistics: (t, id) => request(`/games/${id}/statistics`, { adminToken: t }),
  gameHistory: (t, id) => request(`/games/${id}/history`, { adminToken: t }),
  deleteRound: (t, gameId, roundId) =>
    request(`/games/${gameId}/rounds/${roundId}`, { method: "DELETE", adminToken: t }),
  usedLetters: (t, id) => request(`/games/${id}/letters`, { adminToken: t }),

  // Rodadas
  createRound: (t, body) => request("/rounds", { method: "POST", body, adminToken: t }),
  drawLetter: (t, id) => request(`/rounds/${id}/letter`, { method: "POST", adminToken: t }),
  startRound: (t, id) => request(`/rounds/${id}/start`, { method: "POST", adminToken: t }),
  stopRound: (t, id) => request(`/rounds/${id}/stop`, { method: "POST", adminToken: t }),
  collaborativeCorrectionProgress: (t, id) =>
    request(`/rounds/${id}/collaborative-correction`, { adminToken: t }),
  finishCollaborativeCorrection: (t, id) =>
    request(`/rounds/${id}/collaborative-correction/finish`, { method: "POST", adminToken: t }),
  correctionGrid: (t, id) => request(`/rounds/${id}/correction`, { adminToken: t }),
  groupedCorrectionGrid: (t, id) => request(`/rounds/${id}/correction/grouped`, { adminToken: t }),
  reviewAnswer: (t, id, reviewState) =>
    request(`/answers/${id}`, { method: "PATCH", body: { reviewState }, adminToken: t }),
  reviewAnswers: (t, reviews) =>
    request("/answers/bulk-review", { method: "POST", body: { reviews }, adminToken: t }),
  scoreRound: (t, id) => request(`/rounds/${id}/score`, { method: "POST", adminToken: t }),
  finishRound: (t, id) => request(`/rounds/${id}/finish`, { method: "POST", adminToken: t }),
  cancelRound: (t, id) => request(`/rounds/${id}/cancel`, { method: "POST", adminToken: t }),
  finishGame: (t, id) => request(`/games/${id}/finish`, { method: "POST", adminToken: t }),
  nextRound: (t, gameId, body) =>
    request(`/games/${gameId}/rounds/next`, { method: "POST", body, adminToken: t }),

  // Relatorios academicos entre partidas/turmas
  searchReports: (t, filters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== "") params.set(key, value);
    }
    const query = params.toString();
    return request(`/reports/results${query ? `?${query}` : ""}`, { adminToken: t });
  },

  // Aluno
  getRoom: (code) => request(`/rooms/${code}`),
  identify: (code, registrationNumber) =>
    request(`/rooms/${code}/identify`, { method: "POST", body: { registrationNumber } }),
  join: (code, registrationNumber) =>
    request(`/rooms/${code}/join`, { method: "POST", body: { registrationNumber } }),
  setAvatar: (code, registrationNumber, avatarUrl) =>
    request(`/rooms/${code}/avatar`, { method: "POST", body: { registrationNumber, avatarUrl } }),
  playerState: (code, playerToken) => request(`/rooms/${code}/me`, { playerToken }),
  publicState: (code) => request(`/rooms/${code}/public-state`),
};

export default api;
