import {
	Position,
	TextDocument,
	Location,
	Range,
} from 'vscode-languageserver';
import { SourceFile } from '../sourceFiles';
import {
	getTsActionEntries,
	getSourceTsLocations,
	duplicateLocations,
} from '../utils/commons';
import type * as ts from '@volar/vscode-typescript-languageservice';

export function register(sourceFiles: Map<string, SourceFile>, languageService: ts.LanguageService) {
	return (document: TextDocument, position: Position) => {
		const range = { start: position, end: position };

		if (document.languageId === "typescript") {
			let result = getTsResultWorker(document, range, undefined, languageService);
			result = result.filter(loc => sourceFiles.has(loc.uri)); // duplicate
			return result;
		}

		const sourceFile = sourceFiles.get(document.uri);
		if (!sourceFile) return;

		const tsResult = getTsResult(sourceFile);
		const cssResult = getCssResult(sourceFile);
		const result = [...tsResult, ...cssResult];
		return duplicateLocations(result);

		function getTsResult(sourceFile: SourceFile) {
			let result: Location[] = [];
			for (const sourceMap of sourceFile.getTsSourceMaps()) {
				for (const tsLoc of sourceMap.findVirtualLocations(range)) {
					if (!tsLoc.maped.data.capabilities.references) continue;
					result = result.concat(getTsResultWorker(sourceMap.virtualDocument, tsLoc.range, tsLoc.maped.data.vueTag, sourceMap.languageService));
				}
			}
			return result;
		}
		function getTsResultWorker(tsDoc: TextDocument, tsRange: Range, vueTag: string | undefined, languageService: ts.LanguageService) {
			let result: Location[] = [];
			const worker = languageService.findReferences;
			const entries = getTsActionEntries(tsDoc, tsRange, vueTag, 'reference', worker, languageService, sourceFiles);
			for (const location of entries) {
				const document = languageService.getTextDocument(location.uri);
				if (!document) continue;
				let _result = worker(document, location.range.start);
				_result = _result.map(location => getSourceTsLocations(location, sourceFiles)).flat();
				result = result.concat(_result);
			}
			return result;
		}
		function getCssResult(sourceFile: SourceFile) {
			let result: Location[] = [];
			for (const sourceMap of sourceFile.getCssSourceMaps()) {
				for (const cssLoc of sourceMap.findVirtualLocations(range)) {
					const locations = sourceMap.languageService.findReferences(sourceMap.virtualDocument, cssLoc.range.start, sourceMap.stylesheet);
					for (const location of locations) {
						const sourceLoc = sourceMap.findFirstVueLocation(location.range);
						if (sourceLoc) result.push({
							uri: sourceMap.vueDocument.uri,
							range: sourceLoc.range,
						});
					}
				}
			}
			return result;
		}
	}
}
