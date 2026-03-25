import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type ImportReference = {
  importer: string;
  specifier: string;
  line: number;
  resolvedPath: string;
};

const serverSrcRoot = path.resolve(__dirname);
const controllersRoot = path.join(serverSrcRoot, 'controllers');
const jobsRoot = path.join(serverSrcRoot, 'jobs');
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);

const normalizePath = (value: string) => value.split(path.sep).join('/');

const walkFiles = (directory: string): string[] => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return walkFiles(fullPath);
    }

    if (!sourceExtensions.has(path.extname(entry.name))) {
      return [];
    }

    if (entry.name.includes('.test.') || entry.name.endsWith('.d.ts')) {
      return [];
    }

    return [fullPath];
  });
};

const extractImportReferences = (filePath: string): ImportReference[] => {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const references: ImportReference[] = [];

  const pushReference = (specifier: string, position: number) => {
    if (!specifier.startsWith('.')) {
      return;
    }

    const resolvedPath = path.resolve(path.dirname(filePath), specifier);
    const { line } = sourceFile.getLineAndCharacterOfPosition(position);
    references.push({
      importer: filePath,
      specifier,
      line: line + 1,
      resolvedPath
    });
  };

  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      pushReference(node.moduleSpecifier.text, node.moduleSpecifier.getStart(sourceFile));
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      pushReference(node.arguments[0].text, node.arguments[0].getStart(sourceFile));
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return references;
};

const formatViolation = ({ importer, specifier, line, resolvedPath }: ImportReference) =>
  `${normalizePath(path.relative(serverSrcRoot, importer))}:${line} imports "${specifier}" -> ${normalizePath(
    path.relative(serverSrcRoot, resolvedPath)
  )}`;

describe('architecture boundaries', () => {
  it('prevents controller-to-controller imports', () => {
    const violations = walkFiles(controllersRoot)
      .flatMap(extractImportReferences)
      .filter((reference) => reference.resolvedPath.startsWith(controllersRoot))
      .map(formatViolation);

    expect(violations).toEqual([]);
  });

  it('prevents job-to-controller imports', () => {
    const violations = walkFiles(jobsRoot)
      .flatMap(extractImportReferences)
      .filter((reference) => reference.resolvedPath.startsWith(controllersRoot))
      .map(formatViolation);

    expect(violations).toEqual([]);
  });
});
