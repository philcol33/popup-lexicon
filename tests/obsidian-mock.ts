import { parse, stringify } from 'yaml';
export const parseYaml = parse;
export const stringifyYaml = stringify;
export class TFile { extension = 'md'; constructor(public path: string) {} }
export class TFolder { constructor(public path: string) {} }
export class Component { registerEvent() {} register() {} }
