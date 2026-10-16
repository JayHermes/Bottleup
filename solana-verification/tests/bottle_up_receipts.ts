import { createHash } from "node:crypto";
import type { BottleUpReceipts } from "../target/types/bottle_up_receipts";
import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

describe("bottle_up_receipts", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.BottleUpReceipts as anchor.Program<BottleUpReceipts>;
  const authority = provider.wallet.publicKey;
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  it("rejects an unauthorized initializer", async () => {
    const outsider = Keypair.generate();
    await provider.connection.confirmTransaction(await provider.connection.requestAirdrop(outsider.publicKey, 1_000_000_000), "confirmed");
    try {
      await program.methods.initialize().accountsStrict({ authority: outsider.publicKey, config, systemProgram: SystemProgram.programId }).signers([outsider]).rpc();
      assert.fail("unauthorized initialization succeeded");
    } catch (error) {
      assert.include(String(error), "InvalidAuthority");
    }
    assert.isNull(await provider.connection.getAccountInfo(config));
  });

  it("initializes the authority and records one receipt per pickup", async () => {
    // Use a fresh local validator for this test; initialize is intentionally one-time.
    await program.methods.initialize().accountsStrict({
      authority,
      config,
      systemProgram: SystemProgram.programId,
    }).rpc();

    const pickupHash = Array.from(
      createHash("sha256").update("bottle-up-test-pickup-001").digest()
    );
    const evidenceHash = Array.from(
      createHash("sha256").update("bottle-up-test-evidence-001").digest()
    );
    const [receipt] = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), Buffer.from(pickupHash)],
      program.programId
    );

    await program.methods.recordReceipt(
      pickupHash,
      new anchor.BN(5500), // 5.5 kg, stored as grams
      275,                  // 5.5 kg * 50 bottles/kg
      1,                    // PET bottles
      evidenceHash,
      new anchor.BN(Math.floor(Date.now() / 1000))
    ).accountsStrict({
      authority,
      config,
      receipt,
      systemProgram: SystemProgram.programId,
    }).rpc();

    const account = await program.account.recyclingReceipt.fetch(receipt);
    assert.equal(account.weightGrams.toNumber(), 5500);
    assert.equal(account.bottleCount, 275);
    assert.equal(account.materialCode, 1);
    assert.equal(account.verifier.toBase58(), authority.toBase58());

    let duplicateRejected = false;
    try {
      await program.methods.recordReceipt(
        pickupHash,
        new anchor.BN(5500),
        275,
        1,
        evidenceHash,
        new anchor.BN(Math.floor(Date.now() / 1000))
      ).accountsStrict({
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
  it("rejects zero weight and unauthorized receipt signers", async () => {
    const pickupHash = Array.from(createHash("sha256").update("invalid-pickup").digest());
    const [receipt] = PublicKey.findProgramAddressSync([Buffer.from("receipt"), Buffer.from(pickupHash)], program.programId);
    const evidence = Array(32).fill(0);
    try {
      await program.methods.recordReceipt(pickupHash, new anchor.BN(0), 50, 1, evidence, new anchor.BN(1)).accountsStrict({ authority, config, receipt, systemProgram: SystemProgram.programId }).rpc();
      assert.fail("zero-weight receipt succeeded");
    } catch (error) { assert.include(String(error), "InvalidWeight"); }
    assert.isNull(await provider.connection.getAccountInfo(receipt));
    try {
      await program.methods.recordReceipt(pickupHash, new anchor.BN(1000), 0, 1, evidence, new anchor.BN(1)).accountsStrict({ authority, config, receipt, systemProgram: SystemProgram.programId }).rpc();
      assert.fail("zero-bottle-count receipt succeeded");
    } catch (error) { assert.include(String(error), "InvalidBottleCount"); }
    assert.isNull(await provider.connection.getAccountInfo(receipt));
    const outsider = Keypair.generate();
    await provider.connection.confirmTransaction(await provider.connection.requestAirdrop(outsider.publicKey, 1_000_000_000), "confirmed");
    try {
      await program.methods.recordReceipt(pickupHash, new anchor.BN(1000), 50, 1, evidence, new anchor.BN(1)).accountsStrict({ authority: outsider.publicKey, config, receipt, systemProgram: SystemProgram.programId }).signers([outsider]).rpc();
      assert.fail("unauthorized signer succeeded");
    } catch (error) { assert.include(String(error), "ConstraintHasOne"); }
    assert.isNull(await provider.connection.getAccountInfo(receipt));
  });

});
