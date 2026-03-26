const toMonthParts = (statementMonth: string) => {
  const [yyyy = '0000', mm = '01'] = String(statementMonth).split('-');
  return { yyyy, mm };
};

export const buildStatementRootPrefix = (args: {
  companyId: string;
  statementMonth: string;
  statementId: string;
}) => {
  const { yyyy, mm } = toMonthParts(args.statementMonth);
  return `companies/${args.companyId}/statements/${yyyy}/${mm}/${args.statementId}`;
};

export const buildStatementPdfPath = (rootPrefix: string) => `${rootPrefix}/original/statement.pdf`;

export const buildDerivedPath = (rootPrefix: string, relativePath: string) =>
  `${rootPrefix}/derived/${relativePath.replace(/^\/+/, '')}`;

export const buildPageImagePath = (rootPrefix: string, pageNo: number) =>
  buildDerivedPath(rootPrefix, `pages/page-${String(pageNo).padStart(3, '0')}.png`);

export const buildStatementPageImagePaths = (rootPrefix: string, pageCount: number) =>
  Array.from({ length: Math.max(0, pageCount) }, (_, index) => buildPageImagePath(rootPrefix, index + 1));

export const buildOcrPath = (rootPrefix: string, fileName = 'docai.json') =>
  buildDerivedPath(rootPrefix, `ocr/${fileName}`);

export const buildStatementOcrTextPath = (rootPrefix: string, fileName = 'text.txt') =>
  buildDerivedPath(rootPrefix, `ocr/${fileName}`);

export const buildGeminiPath = (rootPrefix: string, fileName = 'normalized.v1.json') =>
  buildDerivedPath(rootPrefix, `gemini/${fileName}`);

export const buildCheckPath = (rootPrefix: string, checkKey: string, fileName = 'front.jpg') =>
  buildDerivedPath(rootPrefix, `checks/extracted/${checkKey}/${fileName}`);

export const buildCheckCropPath = (rootPrefix: string, checkKey: string, fileName = 'front.jpg') =>
  buildDerivedPath(rootPrefix, `checks/extracted/${checkKey}/${fileName}`);

export const buildCheckOcrPath = (rootPrefix: string, checkKey: string, fileName = 'ocr.json') =>
  buildDerivedPath(rootPrefix, `checks/extracted/${checkKey}/${fileName}`);

export const buildCheckStructuredPath = (
  rootPrefix: string,
  checkKey: string,
  fileName = 'structured.v1.json'
) => buildDerivedPath(rootPrefix, `checks/extracted/${checkKey}/${fileName}`);

export const buildCheckGeminiPath = (rootPrefix: string, checkKey: string, fileName = 'gemini.json') =>
  buildDerivedPath(rootPrefix, `checks/extracted/${checkKey}/${fileName}`);

export const buildCheckUploadedPath = (rootPrefix: string, uploadKey: string) =>
  buildDerivedPath(rootPrefix, `checks/uploaded/${uploadKey}`);

export const buildExportPath = (rootPrefix: string, fileName = 'qb-ready.v1.json') =>
  buildDerivedPath(rootPrefix, `exports/${fileName}`);
