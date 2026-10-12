import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";

describe("bottle_up_receipts", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.BottleUpReceipts as anchor.Program;
  const authority = provider.wallet.publicKey;
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  it("initializes the authority and records one receipt per pickup", async () => {
    // Use a fresh local validator for this test; initialize is intentionally one-time.
    await program.methods.initialize().accounts({
      authority,
      config,
      systemProgram: SystemProgram.programId,
    }).rpc();

    const pickupHash = Array.from(
      anchor.utils.sha256.hash("bottle-up-test-pickup-001")
    );
    const evidenceHash = Array.from(
      anchor.utils.sha256.hash("bottle-up-test-evidence-001")
    );
    const [receipt] = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), Buffer.from(pickupHash)],
      program.programId
    );

    await program.methods.recordReceipt(
      pickupHash,
      new anchor.BN(5500), // 5.5 kg, stored as grams
      1,                    // PET bottles
      evidenceHash,
      new anchor.BN(Math.floor(Date.now() / 1000))
    ).accounts({
      authority,
      config,
      receipt,
      systemProgram: SystemProgram.programId,
    }).rpc();

    const account = await program.account.recyclingReceipt.fetch(receipt);
    assert.equal(account.weightGrams.toNumber(), 5500);
    assert.equal(account.materialCode, 1);
    assert.equal(account.verifier.toBase58(), authority.toBase58());

    let duplicateRejected = false;
    try {
      await program.methods.recordReceipt(
        pickupHash,
        new anchor.BN(5500),
        1,
        evidenceHash,
        new anchor.BN(Math.floor(Date.now() / 1000))
      ).accounts({
        authority,
        config,
        receipt,
        systemProgram: SystemProgram.programId,
      }).rpc();
    } catch {
      duplicateRejected = true;
    }
    assert.isTrue(duplicateRejected, "duplicate receipt must be rejected");
  });
});
