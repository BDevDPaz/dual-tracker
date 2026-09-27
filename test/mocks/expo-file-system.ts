/** Doble de expo-file-system (API File/Directory/Paths de SDK 54): lectura/escritura sobre un Map. */
export const cacheDirectory = "file:///tmp/dt/cache/";
export const documentDirectory = "file:///tmp/dt/document/";
export const __files = new Map<string, string>();
export const __dirs = new Set<string>();

type PathLike = string | { uri: string };
const join = (parts: PathLike[]): string =>
  parts
    .map((p) => (typeof p === "string" ? p : p.uri))
    .reduce((acc, p) => (acc ? `${acc.replace(/\/+$/, "")}/${p.replace(/^\/+/, "")}` : p), "");

export class Directory {
  readonly uri: string;
  constructor(...parts: PathLike[]) {
    this.uri = join(parts).replace(/\/?$/, "/");
  }
  get exists(): boolean {
    return __dirs.has(this.uri);
  }
  create(): void {
    __dirs.add(this.uri);
  }
}

export class File {
  uri: string;
  constructor(...parts: PathLike[]) {
    this.uri = join(parts);
  }
  get exists(): boolean {
    return __files.has(this.uri);
  }
  get name(): string {
    return this.uri.split("/").pop() ?? "";
  }
  create(): void {
    if (!__files.has(this.uri)) __files.set(this.uri, "");
  }
  write(content: string): void {
    __files.set(this.uri, content);
  }
  text(): string {
    return __files.get(this.uri) ?? "";
  }
  delete(): void {
    __files.delete(this.uri);
  }
  move(target: File | Directory): void {
    const dest = target instanceof Directory ? `${target.uri}${this.name}` : target.uri;
    __files.set(dest, __files.get(this.uri) ?? "");
    __files.delete(this.uri);
    this.uri = dest;
  }
}

export const Paths = {
  document: new Directory(documentDirectory),
  cache: new Directory(cacheDirectory),
};

export async function writeAsStringAsync(uri: string, content: string): Promise<void> {
  __files.set(uri, content);
}
export async function readAsStringAsync(uri: string): Promise<string> {
  const v = __files.get(uri);
  if (v === undefined) throw new Error(`ENOENT ${uri}`);
  return v;
}
export function __reset(): void {
  __files.clear();
  __dirs.clear();
}
