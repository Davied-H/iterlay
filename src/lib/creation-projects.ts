export interface CreationProject {
  id: string;
  name: string;
  createdAt: string;
}

const STORAGE_KEY = "iterlay:creation:projects";

export function readCreationProjects(): CreationProject[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CreationProject => Boolean(item)
      && typeof item.id === "string" && typeof item.name === "string"
      && typeof item.createdAt === "string");
  } catch {
    return [];
  }
}

export function writeCreationProjects(projects: CreationProject[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}
