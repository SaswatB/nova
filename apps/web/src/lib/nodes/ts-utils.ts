import { dirname } from "@repo/shared";
import { uniq } from "lodash";
import * as ts from "typescript";

export function getDepTree(files: string[]) {
  const configPaths = uniq(
    files
      .map((f) => ts.findConfigFile(f, ts.sys.fileExists, "tsconfig.json"))
      .filter(<T>(f: T | undefined): f is T => f !== undefined),
  );
  const programs = configPaths
    .flatMap((p) => {
      const config = ts.readConfigFile(p, ts.sys.readFile);
      const parsedConfig = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(p));
      const projectReferences = parsedConfig.projectReferences?.map((ref) => ref.path) || [];
      return [
        parsedConfig,
        ...projectReferences.map((refPath) => {
          const refConfigPath = refPath.endsWith(".json")
            ? refPath
            : ts.findConfigFile(refPath, ts.sys.fileExists, "tsconfig.json");
          if (!refConfigPath) throw new Error(`Could not find tsconfig.json in ${refPath}`);
          const refConfig = ts.readConfigFile(refConfigPath, ts.sys.readFile);
          return ts.parseJsonConfigFileContent(refConfig.config, ts.sys, dirname(refConfigPath));
        }),
      ];
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
            !moduleSpecifier.match(/\.[a-z]+$/) &&
            !moduleSpecifier.match(/\?[a-z]+$/)
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
