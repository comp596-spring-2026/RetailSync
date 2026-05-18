export type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PdfTextItem = {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GroupedPdfLine = {
  page: number;
  y: number;
  text: string;
  items: PdfTextItem[];
  bbox: Box;
};

export type StatementTransaction = {
  id: string;
  section: string;
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit' | 'check' | 'balance';
  page: number;
  rowText: string;
  bbox?: Box;
};

export type CheckRow = {
  checkNumber: string;
  date: string;
  amount: number;
  sourcePage: number;
  rowText: string;
  bbox?: Box;
};

export type CheckCaption = {
  page: number;
  checkNumber: string;
  amount: number;
  text: string;
  bbox: Box;
};

export type DetectedCheckImageAlignment = {
  matchedBy: 'checkNumber+amount' | 'nearestCaption' | 'unmatched';
  captionInsideReviewBox: boolean;
  bottomCaptionPadding: number;
  iou?: number;
  status: 'OK' | 'NEEDS_REVIEW' | 'MISSING_CAPTION' | 'MISALIGNED';
};

export type DetectedCheckImage = {
  page: number;
  checkNumber?: string;
  amount?: number;
  imageBox: Box;
  reviewBox: Box;
  imageCropPath: string;
  reviewCropPath: string;
  caption?: CheckCaption;
  alignment: DetectedCheckImageAlignment;
};

export type OfflineStatementExtractionValidation = {
  sectionCounts: Record<string, number>;
  sectionTotals: Record<string, number>;
  checkCount: number;
  checkTotal: number;
  warnings: string[];
};

export type OfflineStatementExtractionDebug = {
  lines: GroupedPdfLine[];
  captions: CheckCaption[];
  renderedPages: Array<{
    page: number;
    width: number;
    height: number;
    scale: number;
    pageImagePath?: string;
  }>;
};

export type OfflineStatementExtractionResult = {
  transactions: StatementTransaction[];
  checks: CheckRow[];
  checkImages: DetectedCheckImage[];
  validation: OfflineStatementExtractionValidation;
  debug?: OfflineStatementExtractionDebug;
};

export type RenderedPdfPage = {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  buffer: Buffer;
  outputPath?: string;
};
