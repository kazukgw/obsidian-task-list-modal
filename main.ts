import { App, Editor, MarkdownView, Modal, MarkdownRenderer, FuzzySuggestModal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-task-list-modal',
			name: 'Open Task List Modal',
			callback: () => {
				new TaskListModal(this.app).open();
			}
		});
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class Task {
	children: [];
	checked: boolean;
	completed: boolean;
	status: string;
	path: string;
	tags: string[];
	text: string;
}

class TaskListModal extends FuzzySuggestModal<Task> {
	getItems(): Task[] {
		const dv = DataviewAPI;
		const files = dv.pages('"1_Daily"').sort(p => p.file.ctime, "desc").file;
		const tasks = files.tasks.values
			.filter((t)=>{
				return t.status === " " || t.status === "/" || t.status === "<";
			})
			.sort((a, b)=>{
				if(a.status === "/") return -1;
				if(b.status === "/") return 1;

				if(a.tags.includes("#p0") || a.tags.includes("#P0")) return -1;
				if(b.tags.includes("#p0") || b.tags.includes("#P0")) return 1;

				if(a.tags.includes("#p1") || a.tags.includes("#P1")) return -1;
				if(b.tags.includes("#p1") || b.tags.includes("#P1")) return 1;

				if(a.tags.includes("#p2") || a.tags.includes("#P2")) return -1;
				if(b.tags.includes("#p2") || b.tags.includes("#P2")) return 1;

				if(a.path > b.path) return -1;
				if(a.path < b.path) return 1;

				if(a.text > b.text) return -1;
				if(a.text < b.text) return 1;

				return 0;
			});
		return tasks;
	}

	getItemText(item: Task): string {
		return `${item.tags.join(" ")} ${item.text} ${item.path} ${item.children.map(c=>c.text).join(" ")}`;
	}

	onChooseItem(item: Task, evt: MouseEvent | KeyboardEvent): void {
		new Notice(`You selected: ${item.text}`);
		app.workspace.openLinkText("", item.path).then(()=>{
			console.log(item);
			app.workspace.activeEditor.editor.setCursor(item.position.start.line);
			app.workspace.activeEditor.editor.scrollIntoView(
			 	{from: {line: item.position.start.line, ch:0}, to: {line: item.position.end.line, ch:1}},
			 	true
			 );
		});
	}

	renderSuggestion(item: FuzzyMatch<Task>, el: HTMLElement): void {
		const div = el.createDiv();
		const taskText = div.createEl('div');

		const taskTextCheckBox = taskText.createEl('input', { type: 'checkbox' });
		taskTextCheckBox.checked = item.item.checked;
		taskTextCheckBox.setAttribute('data-task', item.item.status);
		taskTextCheckBox.addClass("task-list-item-checkbox");

		const taskTextSpan = taskText.createEl('span', { text: item.item.text });
		taskTextSpan.style.fontSize = '0.8em';

		if (item.item.children.length > 0) {
			const taskContext = div.createEl('div')
			taskContext.style.marginLeft = '2em';
			taskContext.style.color = 'grey';
			taskContext.style.fontSize = '0.6em';
			item.item.children.forEach(child => {
				taskContext.createSpan({ text: child.text });
				taskContext.createEl('br');
			})
		}

		const taskFilePath = div.createEl('div', { text: item.item.path });
		taskFilePath.style.fontSize = '0.6em';
		taskFilePath.style.color = 'rgb(37, 137, 208)';
		taskFilePath.style.textAlign = 'right';
	}
}