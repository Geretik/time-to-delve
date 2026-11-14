import { describe, expect, it } from "vitest";
import { decrypt, encrypt, isEncrypted } from "../scripts/backup-lib";

const passphrase = "dlouhe-testovaci-heslo";
const dump = Buffer.from("PGDMP… obsah zálohy");

describe("backup encryption", () => {
  it("decrypts what it encrypted", async () => {
    const file = await encrypt(dump, passphrase);
    expect(isEncrypted(file)).toBe(true);
    expect(file.includes(dump)).toBe(false);
    expect(await decrypt(file, passphrase)).toEqual(dump);
  });

  it("rejects a wrong passphrase and a changed file", async () => {
    const file = await encrypt(dump, passphrase);
    await expect(decrypt(file, "jine-testovaci-heslo")).rejects.toThrow("špatné heslo");
    const changed = Buffer.from(file);
    changed[changed.length - 20] ^= 1;
    await expect(decrypt(changed, passphrase)).rejects.toThrow("poškozený");
  });

  it("refuses a short passphrase and a file that isn't encrypted", async () => {
    await expect(encrypt(dump, "kratke")).rejects.toThrow("aspoň 16 znaků");
    expect(isEncrypted(dump)).toBe(false);
    await expect(decrypt(dump, passphrase)).rejects.toThrow("není zašifrovaná");
  });
});
