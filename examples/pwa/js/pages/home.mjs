import { FsLitElement, html, css } from '@fstage/lit';

export class PwaHome extends FsLitElement {

	static shadowDom = false;
	
	static styles = css`
		pwa-home .center {
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			width: 100%;
			height: 100%;
		}
		pwa-home ion-tab > * {
			width: 100%;
			height: 100%;
		}
		pwa-home ion-reorder {
			width: 100%;
			height: 100%;
			display: flex !important;
			cursor: pointer !important;
			align-items: center;
			margin-left: 1.5em;
		}
	`;


	/* LIFECYCLE */

	willUpdate(changedProps) {
		this.tasks = this.store.withMeta('tasks');
	}

	firstUpdated() {
		this.selectTab();
	}

	render() {
		return html`
			<pwa-header></pwa-header>
			<ion-content>
				<ion-tabs>
					<ion-tab tab="todo">
						<div id="todo-tab">
							${this.renderTasks(false)}
						</div>
					</ion-tab>
					<ion-tab tab="completed">
						<div id="completed-tab">
							${this.renderTasks(true)}
						</div>
					</ion-tab>
					<ion-tab-bar slot="top" color="light">
						<ion-tab-button tab="todo">
							<ion-label style="font-size:1.2em;">To Do (${this.countTasks(false)})</ion-label>
						</ion-tab-button>
						<ion-tab-button tab="completed">
							<ion-label style="font-size:1.2em;">Completed (${this.countTasks(true)})</ion-label>
						</ion-tab-button>
					</ion-tab-bar>
				</ion-tabs>
				<ion-fab @click="${this.openModal}" vertical="bottom" horizontal="end">
					<ion-fab-button>
						<ion-icon name="add"></ion-icon>
					</ion-fab-button>
				</ion-fab>
				<ion-modal>
					<ion-header>
						<ion-toolbar>
							<ion-buttons slot="start">
								<ion-button @click="${this.closeModal}">Cancel</ion-button>
							</ion-buttons>
							<ion-buttons slot="end">
								<ion-button @click="${this.confirmModal}" strong="true">Save</ion-button>
							</ion-buttons>
						</ion-toolbar>
					</ion-header>
					<ion-content class="ion-padding">
						<ion-item>
							<input type="hidden" name="task-id" value="">
							<ion-input type="text" name="task-name" placeholder="Task name" label="Describe the task" label-placement="stacked"></ion-input>
						</ion-item>
					</ion-content>
				</ion-modal>
			</ion-content>
		`;
	}


	/* EVENTS */

	mayReorder(e) {
		//is left click?
		if(e.button > 0) {
			return;
		}
		//is checkbox update?
		if(e.target.matches('ion-checkbox, ion-button')) {
			return;
		}
		//set vars
		var stop = false;
		//start long press timer
		var tid = setTimeout(() => {
			stop = true;
		}, 300);
		//listen for pointer up
		e.target.addEventListener('pointerup', (e2) => {
			//check cursor movement
			var x = Math.abs(e.clientX - e2.clientX);
			var y = Math.abs(e.clientY - e2.clientY);
			//treat as click?
			if(!stop && x < 5 && y < 5) {
				this.openModal(e2);
				clearTimeout(tid);
			}
		});
	}

	confirmReorder(e) {
		e.detail.complete();
	}

	updateStatus(e) {
		//get task data
		var isChecked = !e.target.checked;
		var el = e.target.closest('[data-key]');
		var localId = el ? el.getAttribute('data-key') : null;
		//do not bubble
		e.stopPropagation();
		//update task by key
		this.store.set('tasks', function(tasks) {
			//update tasks
			return tasks.map(function(t) {
				if(t.__id == localId) {
					t.completed = isChecked;
				}
				return t;
			});
		});
	}

	openModal(e) {
		//get task data
		var el = e.target.closest('[data-key]');
		var localId = el ? el.getAttribute('data-key') : null;
		var task = localId ? this.tasks.data.find((item) => item.__id == localId) : {};
		//get modal
		var modal = this.renderRoot.querySelector('ion-modal');
		//set modal fields
		modal.querySelector('[name=task-id]').value = task.__id || '';
		modal.querySelector('[name=task-name]').value = task.name || '';
		//show modal
		modal.present();
	}

	closeModal(e) {
		var modal = e.target.closest('ion-modal');
		modal.dismiss();
	}

	confirmModal(e) {
		//set vars
		var modal = e.target.closest('ion-modal');
		var localId = modal.querySelector('[name=task-id]').value;
		var name = modal.querySelector('[name=task-name]').value;
		//update store?
		if(name) {
			this.store.set('tasks', (tasks) => {
				//new task?
				if(!localId) {
					tasks.push({ name: name, completed: false });
					return tasks;
				}
				//update tasks
				return tasks.map(function(t) {
					if(t.__id == localId) {
						t.name = name;
					}
					return t;
				});
			}).then(() => {
				modal.dismiss();
				this.selectTab();
			});
		}
	}


	/* HELPERS */

	renderTasks(isCompleted=null) {
		//is loading?
		if(this.tasks.loading) {
			return html`
				<div class="center">
					<ion-spinner name="dots"></ion-spinner>
				</div>
			`;
		}
		//has error?
		if(this.tasks.error) {
			return html`
				<div class="error">
					An error has occurred
				</div>
			`;
		}
		//has no results?
		if(!this.countTasks(isCompleted)) {
			return html`
				<div class="center">
					<span>No tasks found. <a @click="${this.openModal}" href="javascript://">Add one?</a></span>
				</div>
			`;
		}
		//build list
		return html`
			<ion-list>
				<ion-reorder-group disabled="false" @ionItemReorder="${this.confirmReorder}">
				${this.tasks.data.map((t) => {
					if(t.completed == isCompleted) {
						return html`
							<ion-item data-key="${t.__id}" @pointerdown="${this.mayReorder}">
								<ion-button fill="clear" style="position:relative;">
									<ion-checkbox @click="${this.updateStatus}" mode="ios" checked=${t.completed}></ion-checkbox>
								</ion-button>
								<ion-reorder class="full-width">
									<ion-label>${t.name}</ion-label>
								</ion-reorder>
							</ion-item>
						`;
					}
				})}
				</ion-reorder-group>
			</ion-list>
		`;
	}

	countTasks(isCompleted=null) {
		//filter data
		var data = (this.tasks.data || []).filter(function(t) {
			return isCompleted === null || t.completed === isCompleted;
		});
		//return count
		return data.length;
	}

	selectTab(tab='todo') {
		var tabs = this.renderRoot.querySelector('ion-tabs');
		tabs && tabs.select(tab);
	}

}

customElements.define('pwa-home', PwaHome);