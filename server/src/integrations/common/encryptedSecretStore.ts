import { env } from '../../config/env';
import { IntegrationSecretModel } from '../../models/IntegrationSecret';
import { decryptJson, encryptJson } from '../../utils/encryption';

export const loadEncryptedProviderSecret = async <TPayload extends object>(
  companyId: string,
  provider: string
): Promise<TPayload | null> => {
  const secret = await IntegrationSecretModel.findOne({
    companyId,
    provider
  }).select('+encryptedPayload');

  if (!secret?.encryptedPayload) {
    return null;
  }

  return decryptJson<TPayload>(secret.encryptedPayload, env.encryptionKey);
};

export const saveEncryptedProviderSecret = async <TPayload extends object>(
  companyId: string,
  provider: string,
  payload: TPayload
) => {
  await IntegrationSecretModel.findOneAndUpdate(
    { companyId, provider },
    {
      $set: {
        encryptedPayload: encryptJson(payload, env.encryptionKey)
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

export const patchEncryptedProviderSecret = async <TPayload extends Record<string, unknown>>(
  companyId: string,
  provider: string,
  updater: (current: TPayload | null) => TPayload
) => {
  const next = updater(await loadEncryptedProviderSecret<TPayload>(companyId, provider));
  await saveEncryptedProviderSecret(companyId, provider, next);
  return next;
};
