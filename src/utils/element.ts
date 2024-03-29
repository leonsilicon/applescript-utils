import { outdent } from 'outdent';
import type { Options as PWaitForOptions } from 'p-wait-for';
import pWaitFor from 'p-wait-for';

import type { BaseElementReference } from '~/utils/element-reference.js';
import { ElementReference } from '~/utils/element-reference.js';
import { pathStringToPathParts } from '~/utils/path.js';
import { tellProcess } from '~/utils/process.js';
import { runAppleScript } from '~/utils/run.js';

export async function getElements(
	processName: string,
	args: { frontWindow?: boolean } = {}
): Promise<ElementReference[]> {
	const elements = createElementReferences(
		(await runAppleScript(
			outdent`
				tell application "System Events"
				  tell ${args.frontWindow ? 'front window of process' : 'process'} ${JSON.stringify(processName)}
				    get entire contents
				  end tell
				end tell
			`
		)) as string[]
	);

	return elements;
}

export function createBaseElementReference(
	elementPathString: string
): BaseElementReference {
	const pathParts = pathStringToPathParts(elementPathString);

	return {
		application: pathParts.find((part) => part.type === 'application')!.name,
		applicationProcess: pathParts.find(
			(part) => part.type === 'application process'
		)!.name,
		path: pathParts,
		pathString: elementPathString,
	};
}

export function createElementReferences(
	elementPathStrings: string[]
): ElementReference[] {
	const baseElementReferences = elementPathStrings.map((elementPathString) =>
		createBaseElementReference(elementPathString)
	);

	const elementReferences: ElementReference[] = baseElementReferences.map(
		(_, elementIndex) =>
			new ElementReference({
				baseElements: baseElementReferences,
				elementIndex,
			})
	);

	return elementReferences;
}

type WaitForElementProps = {
	elementReference: ElementReference;
	interval?: number;
};
export async function waitForElementExists({
	elementReference,
	interval = 0.1,
}: WaitForElementProps) {
	await tellProcess(
		elementReference.applicationProcess,
		outdent`
			repeat until exists ${elementReference.pathString}
					delay ${interval}
			end repeat
		`
	);
}

type WaitForElementHiddenProps = {
	elementReference: BaseElementReference;
	interval?: number;
};
export async function waitForElementHidden({
	elementReference,
	interval = 0.1,
}: WaitForElementHiddenProps) {
	await runAppleScript(
		outdent`
			tell application "System Events"
				tell process ${JSON.stringify(elementReference.applicationProcess)}
						repeat while exists ${elementReference}
								delay ${interval}
						end repeat
				end tell
			end tell
		`
	);
}

export async function waitForElementMatch(
	windowName: string,
	elementMatcher: (element: ElementReference) => boolean | Promise<boolean>,
	pWaitForOptions?: PWaitForOptions
) {
	pWaitForOptions = {
		timeout: 5000,
		...pWaitForOptions,
	};

	const matchingElement = await pWaitFor(async () => {
		const elements = await getElements(windowName);
		for (const element of elements) {
			// eslint-disable-next-line no-await-in-loop
			if (await elementMatcher(element)) {
				return pWaitFor.resolveWith(element);
			}
		}

		return false;
	}, pWaitForOptions);

	return matchingElement;
}

export async function getElementProperties(
	element: BaseElementReference
): Promise<Record<string, unknown>>;
export async function getElementProperties(
	elements: BaseElementReference[]
): Promise<Array<Record<string, unknown>>>;
export async function getElementProperties(
	elementOrElements: BaseElementReference | BaseElementReference[]
): Promise<Record<string, unknown> | Array<Record<string, unknown>>> {
	if (Array.isArray(elementOrElements)) {
		const elements = elementOrElements;

		if (elements.length === 0) return [];

		const properties = (await tellProcess(
			elements[0]!.applicationProcess,
			outdent`
				return {${elements
					.map((element) => `get properties of ${element.pathString}`)
					.join(',')}}
			`
		)) as Array<Record<string, unknown>>;

		return properties;
	} else {
		const element = elementOrElements;

		const properties = (await tellProcess(
			element.applicationProcess,
			outdent`
				get properties of ${element.pathString}
			`
		)) as Record<string, unknown>;

		return properties;
	}
}
