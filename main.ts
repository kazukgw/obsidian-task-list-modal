import {
	App,
	Editor,
	MarkdownView,
	Modal,
	MarkdownRenderer,
	FuzzySuggestModal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new MySettingTab(this.app, this));

		this.addCommand({
			id: "open-task-list-modal",
			name: "Open Task List Modal",
			callback: () => {
				new TaskListModal(this.app, "task", this.settings.targetFolder).open();
			},
		});

		this.addCommand({
			id: "open-backlog-list-modal",
			name: "Open Backlog List Modal",
			callback: () => {
				new TaskListModal(this.app, "backlog", this.settings.targetFolder).open();
			},
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

interface MyPluginSettings {
	targetFolder: string;
}

export class MySettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setName("Target Folder").addText((text) =>
			text
				.setValue(this.plugin.settings.targetFolder)
				.onChange(async (value) => {
					this.plugin.settings.targetFolder = value;
					await this.plugin.saveSettings();
				})
		);
	}
}

function getTaskContextRecursive(dvTask: {}): any {
	return dvTask.children.map((c) => {
		if (c.children.length > 0) {
			return getTaskContextRecursive(c);
		}
		return c.text;
	});
}

function dvTaskToItem(dvTask: {}): Task {
	return {
		text: dvTask.text,
		path: dvTask.path,
		checked: dvTask.checked,
		status: dvTask.status,
		tags: dvTask.tags,
		position: dvTask.position,
		context: getTaskContextRecursive(dvTask),
		fuzzyMatchTarget: `${dvTask.status}: ${dvTask.tags.join(" ")} ${
			dvTask.text
		} ${dvTask.path} ${dvTask.children.map((c) => c.text).join(" ")}`,
	};
}

function getBacklogList(targetFolder: string): Task[] {
	const dv = DataviewAPI;
	const files = dv.pages(`"${targetFolder}"`).sort((p) => p.file.ctime, "desc").file;
	return files.tasks.values
		.filter((t) => {
			return t.status === ">";
		})
		.sort((a, b) => {
			if (a.tags.includes("#p0") || a.tags.includes("#P0")) return -1;
			if (b.tags.includes("#p0") || b.tags.includes("#P0")) return 1;

			if (a.tags.includes("#p1") || a.tags.includes("#P1")) return -1;
			if (b.tags.includes("#p1") || b.tags.includes("#P1")) return 1;

			if (a.tags.includes("#p2") || a.tags.includes("#P2")) return -1;
			if (b.tags.includes("#p2") || b.tags.includes("#P2")) return 1;

			if (a.path > b.path) return -1;
			if (a.path < b.path) return 1;

			if (a.text > b.text) return -1;
			if (a.text < b.text) return 1;

			return 0;
		})
		.map(dvTaskToItem);
}

function getTaskList(targetFolder: string): Task[] {
	const dv = DataviewAPI;
	const files = dv.pages(`"${targetFolder}"`).sort((p) => p.file.ctime, "desc").file;
	return files.tasks.values
		.filter((t) => {
			return t.status === " " || t.status === "/" || t.status === "<";
		})
		.sort((a, b) => {
			if (a.status === "/") return -1;
			if (b.status === "/") return 1;

			if (a.tags.includes("#p0") || a.tags.includes("#P0")) return -1;
			if (b.tags.includes("#p0") || b.tags.includes("#P0")) return 1;

			if (a.tags.includes("#p1") || a.tags.includes("#P1")) return -1;
			if (b.tags.includes("#p1") || b.tags.includes("#P1")) return 1;

			if (a.tags.includes("#p2") || a.tags.includes("#P2")) return -1;
			if (b.tags.includes("#p2") || b.tags.includes("#P2")) return 1;

			if (a.path > b.path) return -1;
			if (a.path < b.path) return 1;

			if (a.text > b.text) return -1;
			if (a.text < b.text) return 1;

			return 0;
		})
		.map(dvTaskToItem);
}

class Task {
	text: string;
	path: string;
	checked: boolean;
	status: string;
	tags: string[];
	position: {};
	context: string[];
	fuzzyMatchTarget: string;
}

class TaskListModal extends FuzzySuggestModal<Task> {
	constructor(app: App, private mode: "backlog" | "task" = "task", private targetFolder: string) {
		super(app);
		const titleEl = this.modalEl.createDiv();
		if (mode === "backlog") {
			titleEl.textContent = "Backlog List Modal";
		}
		if (mode === "task") {
			titleEl.textContent = "Task List Modal";
		}
		this.modalEl.insertBefore(titleEl, this.modalEl.firstChild);
		titleEl.style.paddingLeft = "0.8em";
		titleEl.style.paddingTop = "0.2em";
		titleEl.style.color = "grey";
		titleEl.style.fontSize = "0.8em";

		this.inputEl.style.paddingTop = "0.5em";
		this.inputEl.style.paddingBottom = "0.5em";
	}

	getItems(): Task[] {
		if (this.mode === "backlog") {
			return getBacklogList(this.targetFolder);
		}
		if (this.mode === "task") {
			return getTaskList(this.targetFolder);
		}
	}

	getItemText(task: Task): string {
		return task.fuzzyMatchTarget;
	}

	onChooseItem(task: Task, evt: MouseEvent | KeyboardEvent): void {
		new Notice(`You selected: ${task.text}`);

		app.workspace.openLinkText("", task.path).then(() => {
			app.workspace.activeEditor.editor.setCursor(
				task.position.start.line
			);
			app.workspace.activeEditor.editor.scrollIntoView(
				{
					from: { line: task.position.start.line, ch: 0 },
					to: { line: task.position.end.line, ch: 1 },
				},
				true
			);
		});
	}

	renderSuggestion(item: FuzzyMatch<Task>, el: HTMLElement): void {
		const div = el.createDiv();
		const taskText = div.createEl("div");

		const taskTextCheckBox = taskText.createEl("input", {
			type: "checkbox",
		});
		taskTextCheckBox.checked = item.item.checked;
		taskTextCheckBox.setAttribute("data-task", item.item.status);
		taskTextCheckBox.addClass("task-list-item-checkbox");

		const taskTextSpan = taskText.createEl("span", {
			text: item.item.text,
		});
		taskTextSpan.style.fontSize = "0.8em";

		if (item.item.context != null && item.item.context.length > 0) {
			const taskContext = div.createEl("div");
			taskContext.style.marginLeft = "2em";
			taskContext.style.color = "grey";
			taskContext.style.fontSize = "0.6em";
			function contextToLine(ctx: any, level: number = 0) {
				if (Array.isArray(ctx)) {
					ctx.forEach((c) => {
						contextToLine(c, level + 1);
					});
				} else {
					const indentText = "  ".repeat(level);
					taskContext.createSpan({ text: indentText + ctx });
					taskContext.createEl("br");
				}
			}
			item.item.context.forEach((c) => {
				contextToLine(c);
			});
		}

		const taskFilePath = div.createEl("div", { text: item.item.path });
		taskFilePath.style.fontSize = "0.6em";
		taskFilePath.style.color = "rgb(37, 137, 208)";
		taskFilePath.style.textAlign = "right";
	}
}
