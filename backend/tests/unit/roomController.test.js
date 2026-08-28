import { describe, expect, it } from "vitest";
import { resolveBaseUrl } from "../../src/controllers/roomController.js";

const LAN = ["10.57.190.47"];
const base = { protocol: "http" };

describe("resolveBaseUrl", () => {
  it("usar host plaino quando ele ja e o IP atual da maquina", () => {
    expect(resolveBaseUrl({ ...base, host: "10.57.190.47:3000" }, { lanAddresses: LAN })).toBe(
      "http://10.57.190.47:3000",
    );
  });

  it("usar hostname da rede local quando nao e um IP", () => {
    expect(resolveBaseUrl({ ...base, host: "stop.local:3000" }, { lanAddresses: LAN })).toBe(
      "http://stop.local:3000",
    );
  });

  it("substituir Host de loopback pelo IP LAN atual", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000"]) {
      expect(resolveBaseUrl({ ...base, host }, { lanAddresses: LAN, port: 3000 })).toBe(
        "http://10.57.190.47:3000",
      );
    }
  });

  it("substituir IP antigo (maquina trocou de rede) pelo IP LAN atual", () => {
    expect(
      resolveBaseUrl({ ...base, host: "192.168.10.121:3000" }, { lanAddresses: LAN, port: 3000 }),
    ).toBe("http://10.57.190.47:3000");
  });

  it("dar prioridade ao x-forwarded-host (proxy reverso)", () => {
    expect(
      resolveBaseUrl(
        { ...base, forwardedHost: "stop.example.com", host: "localhost:3000" },
        { lanAddresses: LAN, port: 3000 },
      ),
    ).toBe("http://stop.example.com");
  });

  it("cair no env (null) quando PUBLIC_BASE_URL esta definido", () => {
    expect(
      resolveBaseUrl({ ...base, host: "localhost:3000" }, { lanAddresses: LAN, publicBaseUrl: "http://fixo" }),
    ).toBeNull();
  });

  it("devolver null quando nao ha host e nem IP LAN cognoscivel", () => {
    expect(resolveBaseUrl({ ...base, host: "localhost:3000" }, { lanAddresses: [], port: 3000 })).toBeNull();
  });
});