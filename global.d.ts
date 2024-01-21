import { DataviewApi } from "obsidian-dataview";

declare global {
    const DataviewAPI: typeof DataviewApi;
}