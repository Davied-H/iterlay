interface NamedFile {
  name: string;
}

export function partitionTemplateImportFiles<T extends NamedFile>(files: Iterable<T>): {
  accepted: T[];
  rejected: T[];
} {
  const accepted: T[] = [];
  const rejected: T[] = [];

  for (const file of files) {
    (/\.itt$/i.test(file.name) ? accepted : rejected).push(file);
  }

  return { accepted, rejected };
}
