import { env } from '../config/env';
import { getStorageClient } from '../integrations/google/storage.client';

type ScriptOptions = {
  apply: boolean;
  allowProduction: boolean;
  ensureBucket: boolean;
  bucketName: string;
  origins: string[];
  maxAgeSeconds: number;
};

const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:4630',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:8080'
];

const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, '');

const parseArgs = (): ScriptOptions => {
  const args = process.argv.slice(2);
  const collectValues = (key: string) =>
    args.reduce<string[]>((items, arg, index) => {
      if (arg === key && args[index + 1]) {
        items.push(args[index + 1] ?? '');
        return items;
      }
      if (arg.startsWith(`${key}=`)) {
        items.push(arg.slice(key.length + 1));
      }
      return items;
    }, []);

  const apply = args.includes('--apply');
  const allowProduction = args.includes('--allow-production');
  const ensureBucket = args.includes('--ensure-bucket');
  const bucketValue = collectValues('--bucket')[0];
  const maxAgeValue = collectValues('--max-age')[0];
  const originArgs = collectValues('--origin')
    .flatMap((value) => value.split(','))
    .map(normalizeOrigin)
    .filter(Boolean);

  const defaultOrigins = Array.from(
    new Set(
      [
        env.clientUrl,
        ...(env.nodeEnv === 'production' ? [] : DEFAULT_LOCAL_ORIGINS),
      ]
        .map(normalizeOrigin)
        .filter(Boolean),
    ),
  );

  const parsedMaxAge = Number(maxAgeValue ?? 3600);

  return {
    apply,
    allowProduction,
    ensureBucket,
    bucketName: bucketValue?.trim() || env.gcsBucketName || '',
    origins: originArgs.length > 0 ? Array.from(new Set(originArgs)) : defaultOrigins,
    maxAgeSeconds:
      Number.isFinite(parsedMaxAge) && parsedMaxAge > 0 ? Math.floor(parsedMaxAge) : 3600,
  };
};

const main = async () => {
  const options = parseArgs();

  if (!options.bucketName) {
    throw new Error('Missing bucket name. Set GCS_BUCKET_NAME or pass --bucket <name>.');
  }

  if (options.origins.length === 0) {
    throw new Error('No origins provided. Pass --origin <url> or set CLIENT_URL.');
  }

  if (env.nodeEnv === 'production' && options.apply && !options.allowProduction) {
    throw new Error(
      'Refusing to apply bucket CORS in production without --allow-production.',
    );
  }

  const corsConfiguration = [
    {
      origin: options.origins,
      method: ['PUT', 'POST', 'OPTIONS'],
      responseHeader: ['Content-Type', 'x-goog-resumable'],
      maxAgeSeconds: options.maxAgeSeconds,
    },
  ];

  const storage = getStorageClient();
  const bucket = storage.bucket(options.bucketName);
  let existingMetadata: { cors?: unknown[] } | null = null;

  try {
    const [metadata] = await bucket.getMetadata();
    existingMetadata = metadata;
  } catch (error) {
    const maybeStorageError = error as { code?: number };
    if (maybeStorageError.code !== 404 || !options.ensureBucket) {
      throw error;
    }

    console.log(
      JSON.stringify(
        {
          status: 'creating_bucket',
          bucket: options.bucketName,
          location: env.gcpRegion.toUpperCase(),
        },
        null,
        2,
      ),
    );

    await storage.createBucket(options.bucketName, {
      location: env.gcpRegion.toUpperCase(),
      storageClass: 'STANDARD',
      iamConfiguration: {
        uniformBucketLevelAccess: {
          enabled: true,
        },
      },
    });

    const [metadata] = await bucket.getMetadata();
    existingMetadata = metadata;
  }

  const summary = {
    apply: options.apply,
    ensureBucket: options.ensureBucket,
    bucket: options.bucketName,
    currentCors: existingMetadata?.cors ?? [],
    nextCors: corsConfiguration,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!options.apply) {
    console.log('Dry run only. Re-run with --apply to update the bucket CORS policy.');
    return;
  }

  await bucket.setCorsConfiguration(corsConfiguration);
  const [updatedMetadata] = await bucket.getMetadata();

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        bucket: options.bucketName,
        appliedCors: updatedMetadata.cors ?? [],
      },
      null,
      2,
    ),
  );
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
