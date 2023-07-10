// Web Engine Video Quest (wevq)
class WEVQ {
	constructor() {
		this.version = [1, 0]; // 0: версия поддержки проекта; 1: иттерация программы
		this.loadProject();
		this.initElements();
		this.initVars();
		this.setupSettings();
		this.onEventsSetup();
		this.updateCoords();
	}

	async loadProject() {
		try {
			this.fetch = await fetch('project.json')
			if (this.fetch.ok) {
				this.project = await this.fetch.json();
				this.isLoaded = true;
			} else {
				alert("Ошибка HTTP: " + response.status);
			}			
		}
		catch (e) {
			if (location.protocol === 'file:') 
				if (confirm('WEVQ cannot be running in a local storage. You can init "project.json" manually.\n\nWould you like made this?')) {
					this.altLoad = document.createElement('input');
					this.altLoad.type = 'file';
					this.altLoad.onchange = async function() {
						this.project = JSON.parse(await this.altLoad.files[0].text());
						this.preloadAllow = false;
						this.isLoaded = true;
					}.bind(this)
					this.altLoad.click();
					return;
				}
			throw e;
		}
	}
	
	initElements() {
		const selectors = {
			'videoElement': '.wevqVideo',
			'commentElement': '.wevqComment',
			'skipElement': '.wevqSkip',
			'pauseButton': '.wevqPause',
			'cursorStyleElement': '.wevqCursorStyle',		
			'overlayElement': '.wevqOverlay',
			'inventoryElement': '.wevqInventory',
		}
		
		for (let sel of Object.entries(selectors) )
			this[sel[0]] = document.querySelector(sel[1]);

		this.dummy = {'disabled': false, 'value': ''};

		for (let elem of ['commentElement', 'skipElement', 'pauseButton']) 
			if (!this[elem]) 
				this[elem] = this.dummy;
	}
	
	initVars() {
		this.isLoaded = false;
		this.actions = null;	
		this.timers = [];
		this.typeSettings = [{'d': ''}];
		this.selectedItem = {};		
		this.preload = {};	
		this.bindAction = 0;
		this.ghostSelItems = [];
		this.warpButtonHolder = 'wevqWarp-';	
		this.preloadAllow = false;
		this.scripts = { // this.runScripts([[]])
			setState: function(args) {
				const argCount = 3;
				if (args.length < argCount) {console.error(this.argError(args, argCount)); return;}						
				if (!Array.isArray(args[1])) args[1] = [args[1]];
				for (let act of args[1]) {
					if (!(act in this.project.actions)) {console.error(`Reference action ${act} is not found!`); continue;}
					this.project.actions[act].state = args[2];
				}
				this.resetActions(true);
			}.bind(this),
			
			timeoutAction: function(args) {
				const argCount = 2;
				if (args.length < argCount) {console.error(this.argError(args, argCount)); return;}	
				let timeout = args[1].timeout;
				if (!timeout)
					timeout = 0;
				this.mountActionFromRef(args[1]);
				this.timers.push(setTimeout(this.setFrame.bind(this), timeout * 1000, args[1].moveTo))
			}.bind(this),
			
			custom: function(args) {
				const argCount = 2;
				if (args.length < argCount) {console.error(this.argError(args, argCount)); return;}
				try {WEVQ_UNTRUSTED_CODE} catch (e) {
					if (e.name === 'ReferenceError') {
						console.error('This command used a custom script and due to security it has been stopped for run. For allow run custom script please declare a "WEVQ_UNTRUSTED_CODE".\nCode:', args[1]); 
						return;
					}
				}
				new Function(args[1])()
				//eval(args[1]);
			}.bind(this),
			
			shiftState: function (args) {
				const argCount = 3;
				if (args.length < argCount) {console.error(this.argError(args, argCount)); return;}
				if (!Array.isArray(args[1])) args[1] = [args[1]];
				for (let act of args[1]) this.project.actions[act].state += +args[2];
			}.bind(this),	

			addItems: function (args) {
				const argCount = 2;
				if (args.length < argCount) {console.error(this.argError(args, argCount)); return;}
				if (!Array.isArray(args[1])) args[1] = [args[1]];
				for (let inv of args[1]) {
					if (!(inv in this.project.items)) {console.error(`Item ${inv} is not assigned in a project!`); continue;}
					if (this.project.inventory.includes(inv)) {console.warn(`Item ${inv} exist in a inventory.`); continue;}
					this.project.inventory.push(inv);
				}
				this.inventoryUpdate();
			}.bind(this),	

			delItems: function (args) {
				const argCount = 2;
				if (args.length < argCount) {console.error(this.argError(args, argCount)); return;}
				if (!Array.isArray(args[1])) args[1] = [args[1]];
				for (let inv of args[1]) {
					let delId = this.project.inventory.indexOf(inv);
					if (delId === -1) {console.warn(`Item ${inv} is not exist in a inventory. Nothing to delete...`); continue;}
					delete(this.project.inventory[delId]);
				}
				let newInv = [];
				for (let inv of this.project.inventory) 
					if (inv !== undefined) 
						newInv.push(inv);
				this.project.inventory = newInv;
				this.inventoryUpdate();
			}.bind(this),
			
			ghostSelItems: function (args) {
				const argCount = 3;
				if (args.length < argCount) {console.error(this.argError(args, argCount)); return;}
				if (!Array.isArray(args[1])) args[1] = [args[1]];
				for (let item of args[1]) {				
					const i = this.project.inventory.indexOf(item);
					if (i === -1) {
						this.debug.logging(`Item ${item} is not exist in a inventory.`, 'warn');
						continue;
					}
					let el;
					let [j, max] = [0, 10];
					while (true) {
						el = window[`wevqInv${i}`];
						if (el)
							break;
						this.inventoryUpdate();
						j++;
						if (j > max) {this.debug.error('Too many try for ghost selecting item'); break;}
					}
					el.classList.toggle('ghostSelect', args[2]);
				}
			}.bind(this),			

			if: function (args) { // ["if", [[5, ">", 7], "&&", ["$state.aaaa", "===", 0]], {"true": [["setState", "", 0]], "false": [[]]}]
				const argCount = 3;
				if (args.length < argCount) {console.error(this.argError(args, argCount)); return;}
				this.runScripts(args[2][String(this.ifOperation(args[1]))]);
			}.bind(this),
			
			_TEMPLATE: function (args) {
				const argCount = 2;
				if (args.length < argCount) {console.error(this.argError(args, argCount)); return;}
			}.bind(this),			
		}
		
		this.conditions = {
			'==': function(a, b){return(a == b)},
			'===': function(a, b){return(a === b)},
			'!=': function(a, b){return(a != b)},
			'>': function(a, b){return(a > b)},
			'>=': function(a, b){return(a >= b)},
			'<': function(a, b){return(a < b)},
			'<=': function(a, b){return(a <= b)},
			'&&': function(a, b){return(a && b)},
			'||': function(a, b){return(a || b)},
			'!': function(a, b){return(!a)},
			'!!': function(a, b){return(!!a)},
			'+': function(a, b){return(a + b)},
			'-': function(a, b){return(a - b)},
			'*': function(a, b){return(a * b)},
			'/': function(a, b){return(a / b)},
			'%': function(a, b){return(a % b)},
			'**': function(a, b){return(a ** b)},
			undefined: function(a, b){return a},
		}

		
		this.debug = {
			logging: function(msg, method) {
				console[method](msg);
			},
			error: function(msg){
				this.debug.logging(msg, 'error')
			}.bind(this),
			
			warn: function(msg){
				this.debug.logging(msg, 'warn')
			}.bind(this),
			
			log: function(msg){
				this.debug.logging(msg, 'log')
			}.bind(this),
			
			info: function(msg){
				this.debug.logging(msg, 'info')
			}.bind(this),
		}
		
	}
	
	setupSettings() {
		document.body.onkeydown = this.keyEvent.bind(this);		
		window.onresize = this.updateCoords.bind(this);		
		this.videoElement.onmousemove = this.mouseEvent.bind(this);
		this.videoElement.onclick = this.mouseEvent.bind(this);		
		
		
	}


	onEventsSetup() {
		const events = [
			'onsetframe',
			'onchangestate',
			'onrunscripts',
		]
		
		for (let ev of events)
			this[ev] = null;
	}
	
	onevent(event_, ...args) {
		if (typeof event_ !== 'function') return;
		this[event_](args);
	}

	argError(args, argCount) {
		return `Script "${args[0]}" require a ${argCount} arguments include a script name. ${args.length} revealed."`;
	}

	ifOperation(conds) {
		for (let i of [0,2])
			if (!conds[i]) 
				continue;
			if (Array.isArray(conds[i]))
				conds[i] = this.ifOperation(conds[i]);
			if (conds[i][0] === '%') {
				const com = conds[i].slice(1).split('.')
				switch(com[0]) { // сюда вписывать новые условия 
					case 'actRefState': conds[i] = this.project.actions[com[1]].state; break;
					case 'haveItem': conds[i] = !!this.project.inventory.includes(com[1]); break;
					default: console.error('Unknown operation\n', conds[i]); conds[i] = undefined; break;
				}
			}				
		return this.conditions[conds[1]](conds[0], conds[2])
	}
	
	
	setFrame(frame) {
		if (!frame) return;
		let currFrameCheck = this.project.frames[frame];
		if (!currFrameCheck) {console.error(`Frame "${frame}" is not found!`); return};
		this.currFrame = currFrameCheck;
		// конец зоны проверки валидности
		
		this.pauseButton.disabled = false;
		for (let i in this.timers) 
			clearTimeout(this.timers[i]);
		this.timers = [];
		this.runScripts(this.currFrame.scripts);
		if (this.currFrame.warp) 
			if (this.currFrame.warp.type === 0) 
				this.activateWarp(this.currFrame.warp.name);
		if (this.currFrame.comment !== '$nochange') 
			this.commentElement.value = (this.currFrame.comment && this.currFrame.type != 3) ? this.currFrame.comment : '';
		this.actions = this.currFrame.actions;
		this.actionsEnabled = !!this.actions;
		if (this.currFrame.type === 3) 
			this.actionsEnabled = false;
		this.skipElement.disabled = false;
		if (typeof this.currFrame.skipable === 'undefined') {
			if (!this.currFrame.used || (this.actions && this.currFrame.type !== 3)) this.skipElement.disabled = true;
		}
		else this.skipElement.disabled = this.currFrame.skipable;
		switch (this.currFrame.type) {
			case 1:
				this.videoElement.loop = true;
				this.videoElement.onended = null;
				break;
			case 0:
			case 2:
			case 3:
				this.videoElement.loop = false;
				this.videoElement.onended = function(){
					this.pauseButton.disabled = true;
					this.currFrame.used = true;
					this.runScripts(this.currFrame.scriptsEnd);
					if (this.currFrame.type === 3) {
						this.skipElement.disabled = true;
						if (this.currFrame.warp) this.activateWarp(this.currFrame.warp.name);
						this.commentElement.value = (this.currFrame.comment) ? this.currFrame.comment : '';
						this.actionsEnabled = true;
						return;						
					}
					this.setFrame(this.currFrame.moveTo);
					//this.hideAllCursors();
				}.bind(this);
				break;
		}
		if (!this.currFrame.movie) {this.setFrame(this.currFrame.moveTo); return;}
		this.videoElement.src = this.loadMovie(this.currFrame.movie);
		
		this.play();
		this.hideAllCursors();
		this.updateCoords();
		this.resetActions();
		this.unuseItem();
		this.inventoryUpdate();
		this.searchPreload(this.currFrame);
	}
	
	loadMovie(movie) { // возвращает url
		if (!this.preloadAllow)
			return movie;
		if (this.preload[movie])
			return this.preload[movie].blobURL;
		return movie;
	}
	
	searchPreload(frame) { // основная задача найти все moveTo 
		if (Array.isArray(frame)) {
			for (let item of frame)
				this.searchPreload(item);	
			return;
		}
		
		for (let key of Object.entries(frame)) {
			if (key[0] === 'moveTo') {
				this.preloadMovie(this.project.frames[key[1]].movie);
			}
			if (typeof key[1] === 'object')
				this.searchPreload(key[1])
		}
	}
	
	async preloadMovie(movie) {
		if (!this.preloadAllow) return;
		if (!this.preload[movie]) {
			this.preload[movie] = {};
			const pl = this.preload[movie];
			pl.fetch = await fetch(movie);
			if (!pl.fetch.ok) {
				this.debug.error(`Movie "${movie}" is not preloaded! Status is not OK.`);
				delete(this.preload[movie]);
				return;
			}
			pl.blobURL = URL.createObjectURL(await pl.fetch.blob());
		}
	}
	
	resetActions(minimal = false) {
		this.cursorSetuped = false;
		this.actionCopied = false;
		let haveCursor;
		this.bindAction = 0;
		for (let i in this.actions) {
			i = +i;
			let action = this.actions[i];
			let cursorName = `wevqCursor${i}`;
			if (!this.actionCopied) 
				this.mountActionFromRef(action);
			const checkAction = JSON.parse(JSON.stringify(action));
			delete(checkAction.ref); 
			delete(checkAction.copied);	
			if (Object.keys(checkAction).length === 0)
				if (this.bindAction === i) 
					this.bindAction++
			if (action.cursor) {
				haveCursor = true;
				this.mountCursor(action, cursorName); 
				
				if (this.bindAction == i && !minimal) 
					window[cursorName].style.opacity = 1;
			}
		}
		this.cursorSetuped = true;
		this.actionCopied = true;
	}
	
	updateCoords() {
		this.x1RangeVideo = this.videoElement.offsetLeft;
		this.y1RangeVideo = this.videoElement.offsetTop;
		this.widthVideo = this.videoElement.offsetWidth;
		this.heightVideo = this.videoElement.offsetHeight;		
		this.x2RangeVideo = this.widthVideo + this.x1Range;
		this.y2RangeVideo = this.heightVideo + this.y1Range;
	}

	init() {
		if (!this.isLoaded) {
			console.log('it still not loaded...');
			return;
		}
		if (this.project.cursors) this.cursorStyleElement.innerText = `.wevqCursor {position: absolute; z-index: 1; width: ${(this.project.wevq.cursors.w / this.project.wevq.w)*100}%; height: ${(this.project.wevq.cursors.h / this.project.wevq.h)*100}%; pointer-events: none;}`
		this.setFrame(this.project.wevq.start);
	}

	play() {
		let el = this.videoElement;
		el.play().then(result => {}, error => {console.log('!'); el.volume = 0, el.play()});
	}

	checkMouseInZone(x1, y1, x2, y2, clientX, clientY) {
		let absX = ((clientX - this.x1RangeVideo) / this.widthVideo) * this.project.wevq.w;
		let absY = ((clientY - this.y1RangeVideo) / this.heightVideo) * this.project.wevq.h;
		return (absX > x1 && absX < x2) && (absY > y1 && absY < y2);
	}

	mouseEvent(event) {
		//console.log(this)
		if (!this.actionsEnabled) return;
		let output = '';
		this.updateCoords();
		if (this.actions) {
			for (let i in this.actions) {
				i = +i;
				let action = this.actions[i];
				//if (!this.actionCopied) this.mountActionFromRef(action);
				let cursorName = `wevqCursor${i}`;
				//if (action.cursor) {
				//	this.mountCursor(action, cursorName); 
				//	window[cursorName].style.opacity = 0;
				//}
				if (this.checkMouseInZone(action.x1, action.y1, action.x2, action.y2, event.clientX, event.clientY)) {
					this.bindAction = i;
					output = action.comment ? action.comment : '';
					if (action.cursor) {
						this.hideAllCursors()
						window[cursorName].style.opacity = 1;
					}
					if (event.type === 'click') {
						this.bindAction = 0;
						this.hideAllCursors();
						//this.actionCopied = false;
						//this.cursorSetuped = false;
						//this.setFrame(action.moveTo);
						this.actionActivate(action);
						return;
					}
				}
			}
			//this.cursorSetuped = true;
			//this.actionCopied = true;
		}
		if (this.commentElement.value !== output) this.commentElement.value = output;
	}
	
	keyEvent(event) {
		if (event.key == 'Escape') {this.inventoryClose(); return;};
		if (!this.actionsEnabled) return;
		if (this.actions) {
			const arrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
			if (event.key === 'Enter') if (this.bindAction !== -1) {
				window[`wevqCursor${this.bindAction}`].style.opacity = 0;
				this.actionActivate(this.actions[this.bindAction]);
				//this.setFrame(this.actions[this.bindAction].moveTo); 
				this.bindAction = 0;
				//this.cursorSetuped = false;
				//this.actionCopied = false;
				return;
			}
			let maxX, maxY;
			if (true) {
				let action = this.actions[this.bindAction];
				maxX = action.x;
				maxY = action.y;
			}
			const currX = maxX;
			const currY = maxY;
			let edge = -1;
			let distance = Infinity;
			for (let i in this.actions) {
				i = +i;
				let action = this.actions[i];
				if (!action.cursor) continue;
				//if (!this.actionCopied) this.mountActionFromRef(action);
				let cursorName = `wevqCursor${i}`;
				//this.mountCursor(action, cursorName);
				if (this.bindAction === i) continue;
				let currDist;
				switch (event.key) {
					case arrow[0]: currDist = maxX - action.x; break;
					case arrow[1]: currDist = action.x - maxX; break;
					case arrow[2]: currDist = maxY - action.y; break;
					case arrow[3]: currDist = action.y - maxY; break;
				}
				
				if (currDist > 0 && distance > currDist) {
					distance = currDist;
					edge = i;
				}
			}
			
			if (edge !== -1) {
				window[`wevqCursor${edge}`].style.opacity = 1;
				window[`wevqCursor${this.bindAction}`].style.opacity = 0;
				this.bindAction = edge;
			}
			
			//this.cursorSetuped = true;
			//this.actionCopied = true;
		}
		//if (this.commentElement.value !== output) this.commentElement.value = output;
	}
	
	actionActivate(action) {
		if (action.moveTo) 
			this.setFrame(action.moveTo);
		else { 
			if (typeof action.moveTo === 'string') {
				this.debug.warn('Argument "moveTo" exist, but empty...\n')
				this.debug.warn(action)
			}
		}
		this.internalRun(action.internal);
	}
	
	internalRun(funcName) {
		if (!funcName) return;
		const func = this[funcName];
		if (typeof func !== 'function') {console.error(`"funcName" is not a function!`); return;}
		func.bind(this)();
	}
	
	inventoryOpen() {
		this.inventoryUpdate();
		this.overlayElement.style.display = '';
		this.inventoryElement.style.display = '';
		this.videoElement.pause();
		this.actionsEnabled = false;
	}
	
	inventoryClose() {
		this.overlayElement.style.display = 'none';
		this.inventoryElement.style.display = 'none';
		this.videoElement.play();
		this.actionsEnabled = true;
		this.bindAction = 0;
		this.resetActions();
	}
	
	inventoryUpdate() {
		let i = 0;
		let selected = this.selectedItem ? this.selectedItem.name : '';
		let itemsScripts = this.currFrame.itemsScripts;
		if (!itemsScripts) itemsScripts = {};
		while (true) {
			let elem = window[`wevqInv${i}`]
			if (typeof elem === 'undefined') break;
			let itemName = this.project.inventory[i++];
			let item = this.project.items[itemName];
			elem.querySelector('.wevqInventoryImg').src = item ? item.img : '';
			elem.querySelector('.wevqInventoryLabel').innerText = item ? item.label : '';
			elem.setAttribute('name', item ? itemName : '');
			elem.disabled = true;
			for (let scrItem in itemsScripts)
				if (scrItem === itemName && selected !== itemName) {
					elem.disabled = false;
					break;
				}
			elem.classList.toggle('wevqItemUsed', (((selected === itemName) || elem.classList.contains('ghostSelect')) && !!itemName));
			
		}
	}

	useItem(name) {
		if (!name) return;
		if (!this.project.inventory.includes(name)) {console.error(`Item "${name}" is not found in a inventory!`); return}
		const items = this.currFrame.itemsScripts;
		if (!items) {console.error(`This frame is not contain any items events.`); return;}
		this.selectedItem = items[name];
		if (!this.selectedItem) {
			console.error(`Item "${name}" is not assigned in a frame.`);
			this.selectedItem = {};
			return;
		}
		this.selectedItem.name = name;
		this.runScripts(this.selectedItem.select);
		this.searchPreload(this.currFrame);
		this.inventoryClose();
		this.inventoryUpdate();
	}
	
	unuseItem() {
		this.runScripts(this.selectedItem.unselect);
		this.selectedItem = {};
		this.inventoryUpdate();
	}
	
	mountCursor(action, cursorName) {
		if (!this.cursorSetuped) {
			if (typeof window[cursorName] === 'undefined') {
				let el = document.createElement('img');
				el.classList.add('wevqCursor');
				el.id = cursorName;
				this.videoElement.parentElement.append(el);
			}
			let cursor = this.project.cursors[action.cursor];
			window[cursorName].src = cursor.img;
			if (window[cursorName].src === 'undefined') console.error(`Cursor "${action.cursor} is not found!"`);
			window[cursorName].style.left = `${(action.x / this.project.wevq.w)*100}%`;
			window[cursorName].style.top = `${(action.y / this.project.wevq.h)*100}%`;
			window[cursorName].style.transform = action.rot ? `rotate(${action.rot}deg)` : '';
			window[cursorName].style.opacity = 0;
			if (!cursor.size) 
				cursor.size = {'w': this.project.wevq.cursors.w, 'h': this.project.wevq.cursors.h};
			if (Number.isNaN(action.x1 + action.y1 + action.x2 + action.y2)) {
				action.x1 = action.x;
				action.y1 = action.y;
				action.x2 = action.x + cursor.size.w;
				action.y2 = action.y + cursor.size.h;					
			}
		}
	}
	
	hideAllCursors() {
		let i = 0
		while (true) {
			let cursorName = `wevqCursor${i++}`;
			if (!window[cursorName]) break;
			window[cursorName].style.opacity = 0;
		}
	}
	
	mountActionFromRef(action) {
		if (!action) return;
		if (action.copied) {// убивает элементв ранее скопированные для обновления состояния
			if (action.copied.indexOf('cursor') !== -1) 
				for (let coords of ['x1', 'y1', 'x2', 'y2']) 
					delete(action[coords]);
			for (let copy of action.copied) 
				delete(action[copy]); 
		}
		let ref = action.ref; if (!ref) return;
		let refAction = this.project.actions[ref]; if (!refAction) {console.error(`Reference action "${ref}" is not found!`); return};
		let state = refAction.state; if (typeof state === 'undefined') state = 0;
		let selState = refAction.actions[state];
		if (selState.ref) {
			this.copyInternalRef(ref, selState.ref, selState);
			delete(selState.ref);
		}
		action.copied = [];
		for (let from in selState) {
			action[from] = selState[from];
			action.copied.push(from);
		}
	}
	
	copyInternalRef(refName, refIn, selState) {
		if (refName === refIn) return;
		let [id, from] = [refIn.id, refIn.from];
		if (typeof id === 'undefined') {console.error(`Internal reference of "${refName}" is wrong setuped. ID not specified.\n`, refIn); return}
		if (!from) from = refName;
		const refActionFromID = this.project.actions[from].actions[id];
		if (refActionFromID.ref) {
			this.copyInternalRef(from, refActionFromID.ref, refActionFromID);
			delete(refActionFromID.ref);
		}
		for (let fromIn in refActionFromID) {
			selState[fromIn] = refActionFromID[fromIn];
		}
	}

	skip() {
		this.videoElement.currentTime = this.videoElement.duration - 1;
		this.skipElement.disabled = true;
	}

	activateWarp(warp) {
		if (warp) {
			let warpButton = document.querySelector(`.wevqWarp-${warp}`);
			//console.log(warpButton);
			if (warpButton) warpButton.style = '';
		}
	}

	warp(event) {
		console.log(event)
		let warpClass = event.className.replace(this.warpButtonHolder, '');
		if (!warpClass) return;
		let currWarp = this.project.warpzones[warpClass];
		console.log(warpClass)
		if (!currWarp) return;
		this.setFrame(currWarp);
	}

	warpTo(warp) {
		
	}

	playButton(btn) {
		wevq.videoElement.paused ? wevq.videoElement.play() : wevq.videoElement.pause();
	}
	
	runScripts(scripts) {
		if (!scripts) return;
		scripts = JSON.parse(JSON.stringify(scripts));
		if (!Array.isArray(scripts)) {console.error('"scripts" is not a array!', scripts); return;}
		for (let scr of scripts) {
			if (!scr) continue;
			if (!Array.isArray(scr)) {console.error('One of the script is not a array! Probably you send a one-dimensional array'); continue;}
			if (!(scr[0] in this.scripts)) {console.error(`Script "${scr[0]}" is not found!`); continue;}
			this.scripts[scr[0]](scr);
		}
	}
}

var wevq
document.addEventListener("DOMContentLoaded", (function(){
	wevq = new WEVQ()
	}));


