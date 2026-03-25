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

const clientSrcRoot = path.resolve(__dirname);
const modulesRoot = path.join(clientSrcRoot, 'modules');
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
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
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

const getModuleName = (filePath: string) => {
  const relativePath = path.relative(modulesRoot, filePath);
  const [moduleName] = relativePath.split(path.sep);
  return moduleName || null;
};

const formatViolation = ({ importer, specifier, line, resolvedPath }: ImportReference) =>
  `${normalizePath(path.relative(clientSrcRoot, importer))}:${line} imports "${specifier}" -> ${normalizePath(
    path.relative(clientSrcRoot, resolvedPath)
  )}`;

const allowedCrossModuleImports = [
  'modules/accounting/hooks/useQuickBooksWorkspace.ts:5 imports "../../settings/components" -> modules/settings/components',
  'modules/accounting/pages/QuickBooksSyncPage.tsx:18 imports "../../settings/components" -> modules/settings/components',
  'modules/auth/pages/CreateCompanyPage.tsx:13 imports "../../users/state" -> modules/users/state',
  'modules/auth/pages/JoinCompanyPage.tsx:12 imports "../../users/state" -> modules/users/state',
  'modules/auth/state/authSlice.ts:4 imports "../../users/state" -> modules/users/state',
  'modules/pos/components/ImportPOSDataModal.tsx:48 imports "../../settings/api" -> modules/settings/api',
  'modules/pos/components/ImportPOSDataModal.tsx:51 imports "../../settings/state" -> modules/settings/state',
  'modules/pos/pages/PosPage.tsx:30 imports "../../settings/state" -> modules/settings/state',
  'modules/pos/state/posSlice.ts:3 imports "../../settings/api" -> modules/settings/api',
  'modules/users/pages/AccessHubPage.tsx:6 imports "../../rbac/pages/RolesPage" -> modules/rbac/pages/RolesPage',
  'modules/users/pages/AccessHubPage.tsx:7 imports "../../settings/pages/SettingsPage" -> modules/settings/pages/SettingsPage',
  'modules/users/pages/UsersPage.tsx:35 imports "../../rbac/state" -> modules/rbac/state',
  'modules/users/state/usersSlice.ts:3 imports "../../rbac/state" -> modules/rbac/state'
].sort();

describe('architecture boundaries', () => {
  it('prevents unapproved frontend cross-module imports', () => {
    const violations = walkFiles(modulesRoot)
      .flatMap((filePath) => {
        const importerModuleName = getModuleName(filePath);
        if (!importerModuleName) {
          return [];
        }

        return extractImportReferences(filePath).filter((reference) => {
          if (!reference.resolvedPath.startsWith(modulesRoot)) {
            return false;
          }

          const importedModuleName = getModuleName(reference.resolvedPath);
          return Boolean(importedModuleName && importedModuleName !== importerModuleName);
        });
      })
      .map(formatViolation)
      .sort();

    expect(violations).toEqual(allowedCrossModuleImports);
  });
});
