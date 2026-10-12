use anchor_lang::prelude::*;

// Devnet deployment ID; synchronized with the private program keypair.
declare_id!("F8VR44MDbcA6ZFNaz5UerqZLnbVwT7DPKuqNaxLPd6C");

// Only this deployment wallet can initialize the receipt authority.
const INITIAL_AUTHORITY: Pubkey = Pubkey::new_from_array([67,232,168,92,74,242,70,34,196,75,220,82,79,233,29,103,125,20,80,93,240,251,4,4,80,156,179,206,16,39,180,16]);

#[program]
pub mod bottle_up_receipts {
    use super::*;

    /// Run once immediately after deployment. The signer becomes the receipt authority.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        require_keys_eq!(ctx.accounts.authority.key(), INITIAL_AUTHORITY, ReceiptError::InvalidAuthority);
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.bump = ctx.bumps.config;
        msg!("Bottle Up receipt authority initialized");
        Ok(())
    }

    /// Records a completed, off-chain-verified pickup.
    /// pickup_id_hash and evidence_hash are SHA-256 hashes; no personal data is stored on-chain.
    pub fn record_receipt(
        ctx: Context<RecordReceipt>,
        pickup_id_hash: [u8; 32],
        weight_grams: u64,
        material_code: u16,
        evidence_hash: [u8; 32],
        verified_at: i64,
    ) -> Result<()> {
        require!(weight_grams > 0, ReceiptError::InvalidWeight);
        require!(verified_at > 0, ReceiptError::InvalidTimestamp);

        let receipt = &mut ctx.accounts.receipt;
        receipt.pickup_id_hash = pickup_id_hash;
        receipt.weight_grams = weight_grams;
        receipt.material_code = material_code;
        receipt.evidence_hash = evidence_hash;
        receipt.verified_at = verified_at;
        receipt.verifier = ctx.accounts.authority.key();
        receipt.bump = ctx.bumps.receipt;

        emit!(ReceiptRecorded {
            receipt: receipt.key(),
            pickup_id_hash,
            weight_grams,
            material_code,
            verified_at,
            verifier: receipt.verifier,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + ReceiptConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, ReceiptConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pickup_id_hash: [u8; 32])]
pub struct RecordReceipt<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ReceiptConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + RecyclingReceipt::INIT_SPACE,
        seeds = [b"receipt", pickup_id_hash.as_ref()],
        bump
    )]
    pub receipt: Account<'info, RecyclingReceipt>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct ReceiptConfig {
    pub authority: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RecyclingReceipt {
    pub pickup_id_hash: [u8; 32],
    pub weight_grams: u64,
    pub material_code: u16,
    pub evidence_hash: [u8; 32],
    pub verified_at: i64,
    pub verifier: Pubkey,
    pub bump: u8,
}

#[event]
pub struct ReceiptRecorded {
    pub receipt: Pubkey,
    pub pickup_id_hash: [u8; 32],
    pub weight_grams: u64,
    pub material_code: u16,
    pub verified_at: i64,
    pub verifier: Pubkey,
}

#[error_code]
pub enum ReceiptError {
    #[msg("Only the deployment authority may initialize this program.")]
    InvalidAuthority,
    #[msg("Verified weight must be greater than zero.")]
    InvalidWeight,
    #[msg("Verification timestamp must be a positive Unix timestamp.")]
    InvalidTimestamp,
}
