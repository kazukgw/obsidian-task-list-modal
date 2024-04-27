import {
	App,
	FuzzySuggestModal,
	FuzzyMatch,
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

class TaskContext {
	text: string;
	children: TaskContext[];
}

function getTaskContextRecursive(dvTask: any): TaskContext[] {
	return dvTask.children.map((c: any) => {
		const ctx = new TaskContext();
		const status = (c.status != null && c.status.length > 0) ?  `[${c.status}] ` : "";
		ctx.text = `${c.symbol} ${status}${c.text}`;
		ctx.children = [];
		if(c.children.length > 0) {
			ctx.children = getTaskContextRecursive(c);
		}	
		return ctx;
	});
}

function getTaskContextTextRecursive(dvTask: any): string {
	return dvTask.text + " " + dvTask.children.reduce((acc: string, cur: any) => {
		if(cur.children.length > 0) {
			return acc + " " + getTaskContextTextRecursive(cur);
		}
		return acc + " " + cur.text;
	}, "");
}

function dvTaskToItem(dvTask: any): Task {
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
		} ${dvTask.path} ${getTaskContextTextRecursive(dvTask)}`,
	};
}

function getBacklogList(targetFolder: string): Task[] {
	const dv = DataviewAPI;
	const files = dv.pages(`"${targetFolder}"`).sort((p:any) => p.file.ctime, "desc").file;
	return files.tasks.values
		.filter((t: any) => {
			return t.status === ">";
		})
		.sort((a: any, b: any) => {
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
	const files = dv.pages(`"${targetFolder}"`).sort((p: any) => p.file.ctime, "desc").file;
	return files.tasks.values
		.filter((t: any) => {
			return t.status === " " || t.status === "/" || t.status === "<";
		})
		.sort((a: any, b: any) => {
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
	position: any;
	context: TaskContext[];
	fuzzyMatchTarget: string;
}

class TaskListModal extends FuzzySuggestModal<Task> {
	readonly limit: number = 200;

	titleEl: HTMLElement;

	constructor(app: App, private mode: "backlog" | "task" = "task", private targetFolder: string) {
		super(app);
		this.titleEl = this.modalEl.createDiv();
		if (mode === "backlog") {
			this.titleEl.textContent = "Backlog List Modal";
		}
		if (mode === "task") {
			this.titleEl.textContent = "Task List Modal";
		}
		this.modalEl.insertBefore(this.titleEl, this.modalEl.firstChild);
		this.titleEl.style.paddingLeft = "0.8em";
		this.titleEl.style.paddingTop = "0.2em";
		this.titleEl.style.color = "grey";
		this.titleEl.style.fontSize = "0.8em";

		this.inputEl.style.paddingTop = "0.5em";
		this.inputEl.style.paddingBottom = "0.5em";
	}

	getItems(): Task[] {
		let items: Task[];
		if (this.mode === "backlog") {
			items = getBacklogList(this.targetFolder);
		} else if (this.mode === "task") {
			items = getTaskList(this.targetFolder);
		} else {
			items = getTaskList(this.targetFolder);
		}
		this.titleEl.textContent += `  (${items.length+1} tasks)`
		return items;

	}

	getItemText(task: Task): string {
		return task.fuzzyMatchTarget;
	}

	onChooseItem(task: Task, evt: MouseEvent | KeyboardEvent): void {
		new Notice(`You selected: ${task.text}`);

		app.workspace.openLinkText("", task.path, true).then(() => {
			app.workspace.activeEditor?.editor?.setCursor(
				task.position.start.line
			);
			app.workspace.activeEditor?.editor?.scrollIntoView(
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
			function contextToLine(ctx: TaskContext, level: number = 0) {
				const indentText = "  ".repeat(level);
				taskContext.createSpan({ text: indentText + ctx.text });
				taskContext.createEl("br");
				if (ctx.children.length > 0) {
					ctx.children.forEach((c) => {
						contextToLine(c, level + 1);
					});
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
