import { uniq } from "lodash";
import { dirname } from "path";
import * as ts from "typescript";

export function getDepTree(files: string[]) {
  const configPaths = uniq(
    files
      .map((f) => ts.findConfigFile(f, ts.sys.fileExists, "tsconfig.json"))
      .filter(<T>(f: T | undefined): f is T => f !== undefined),
  );
  const programs = configPaths
    .map((p) => {
      const config = ts.readConfigFile(p, ts.sys.readFile);
      return ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(p));
    })
    .map((config) => ts.createProgram(config.fileNames, config.options));

  const dependencies: Record<string, { fileName?: string; moduleSpecifier: string }[]> = {};
  for (const program of programs) {
    program.getSourceFiles().forEach((sourceFile) => {
      if (sourceFile.isDeclarationFile) return;

      const fileName = sourceFile.fileName;
      const imports: { fileName?: string; moduleSpecifier: string }[] = [];

      ts.forEachChild(sourceFile, (node) => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
          const resolver = ts.resolveModuleName(moduleSpecifier, fileName, program.getCompilerOptions(), ts.sys);
          const resolvedFileName = resolver?.resolvedModule?.resolvedFileName;
          if (
            !resolvedFileName &&
            (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) &&
            !moduleSpecifier.match(/\.[a-z]+$/)
          )
            throw new Error(`Could not resolve module ${moduleSpecifier} in ${fileName}`);
          imports.push({ fileName: resolvedFileName, moduleSpecifier });
        }
      });

      dependencies[fileName] = imports;
    });
  }

  return dependencies;
}
