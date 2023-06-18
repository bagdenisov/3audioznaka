// Web Engine Video Quest (wevq)
class WEVQ {
	constructor() {
		this.version = '1.0';
		var WEVQ_UNTRUSTED_CODE = false;
		this.xhr = new XMLHttpRequest();
		this.xhr.open('GET', 'project.json', true);
		this.xhr.send();
		this.xhr.onreadystatechange = function() {
			if (this.xhr.readyState === 4) {
				this.project = JSON.parse(this.xhr.responseText);
				this.isLoaded = true;
			}
		}.bind(this)
		
		this.videoElement = document.querySelector('.wevqVideo');
		//this.videoElement.src.then((value) => {this.updateCoords.bind(this)}, (reason) => {console.error(reason);});
		//this.srcElement = this.videoElement.querySelector('source');
		this.commentElement = document.querySelector('.wevqComment');
		this.skipElement = document.querySelector('.wevqSkip');
		this.pauseButton = document.querySelector('.wevqPause');
		this.isLoaded = false;
		this.actions = null;
		this.updateCoords();
		this.dummy = {'disabled': false, 'value': ''};
		for (let elem of ['commentElement', 'skipElement', 'pauseButton']) if (!this[elem]) this[elem] = this.dummy;
		this.videoElement.onmousemove = this.mouseEvent.bind(this);
		this.videoElement.onclick = this.mouseEvent.bind(this);
		this.warpButtonHolder = 'wevqWarp-';
		window.onresize = this.updateCoords.bind(this);
		this.timers = [];
		this.typeSettings = [{'d': ''}]
		
		this.scripts = {
			setState: function(args) {
				if (Array.isArray(args[1])) {
					for (let act of args[1]) this.project.actions[act].state = args[2];
					return;
				}
				this.project.actions[args[1]].state = args[2];
			}.bind(this),
			
			timeoutAction: function(args) {;
				this.mountActionFromRef(args[1]);
				this.timers.push(setTimeout(this.setFrame.bind(this), args[1].timeout * 1000, args[1].moveTo))
			}.bind(this),
		}
	}

	setFrame(frame) {
		if (!frame) return;
		let currFrameCheck = this.project.frames[frame];
		if (!currFrameCheck) {console.error(`Frame "${frame}" is not found!`); return};
		// конец зоны проверки валидности
		this.pauseButton.disabled = false;
		for (let i in this.timers) clearTimeout(this.timers[i]);
		this.timers = [];
		this.currFrame = currFrameCheck;
		this.runScripts(this.currFrame.scripts);
		if (this.currFrame.warp) if (this.currFrame.warp.type === 0) this.activateWarp(this.currFrame.warp.name);
		if (this.currFrame.comment !== '$nochange') this.commentElement.value = (this.currFrame.comment && this.currFrame.type != 3) ? this.currFrame.comment : '';
		this.actions = this.currFrame.actions;
		this.actionsEnabled = !!this.actions;
		if (this.currFrame.type === 3) this.actionsEnabled = false;
		this.skipElement.disabled = false;
		if (typeof this.currFrame.skiped === 'undefined') {
			if (!this.currFrame.used || (this.actions && this.currFrame.type !== 3)) this.skipElement.disabled = true;
		}
		else this.skipElement.disabled = this.currFrame.skiped;
		
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
				}.bind(this);
				break;
		}
		if (!this.currFrame.movie) {this.setFrame(this.currFrame.moveTo); return;}
		this.videoElement.src = this.currFrame.movie;
		this.play();
		this.updateCoords();
		
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
		this.setFrame(this.project.wevq.start);
	}

	play() {
		let el = this.videoElement;
		el.play().then(result => el.volume = 1, error => {el.volume = 0, el.play()});
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
				let action = this.actions[i]
				if (!this.actionCopied) this.mountActionFromRef(action);
				if (this.checkMouseInZone(action.x1, action.y1, action.x2, action.y2, event.clientX, event.clientY)) {
					output = action.comment ? action.comment : '';
					if (event.type === 'click') {
						this.actionCopied = false;
						this.setFrame(action.moveTo);
						return;
					}
				}
			}
			this.actionCopied = true;
		}
		if (this.commentElement.value !== output) this.commentElement.value = output;
	}
	
	mountActionFromRef(action) {
		if (!action) return;
		if (action.copied) for (let copy of action.copied) delete(action[copy]); // убивает элементв ранее скопированные для обновления состояния
		let ref = action.ref; if (!ref) return;
		let refAction = this.project.actions[ref]; if (!refAction) {console.error(`Reference action "${ref}" is not found!`); return};
		let state = refAction.state; if (typeof state === 'undefined') state = 0;
		action.copied = [];
		for (let from in refAction.actions[state]) {
			action[from] = refAction.actions[state][from];
			action.copied.push(from);
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
		if (typeof scripts !== 'object') {console.error('"scripts" is not a object!'); return;}
		for (let scr of scripts) {
			if (!scr) continue;
			if (typeof scr !== 'object') {console.error('One of the script is not a object!'); continue;}
			if (scr[0] === 'custom') if (!WEVQ_UNTRUSTED_CODE) {
				console.error('This command used a custom script and due to security it has been stoped for run. For allow run custom script set "WEVQ_UNTRUSTED_CODE" to "true"');
				continue;
			}
			this.scripts[scr[0]](scr);
		}
	}
}

var wevq
document.addEventListener("DOMContentLoaded", (function(){
	wevq = new WEVQ()
	//window.onresize = wevq.updateCoords.bind(wevq);
	//const xhr = new XMLHttpRequest();
	//xhr.open('GET', 'project.json', true);
    //xhr.send();
    //xhr.onreadystatechange = function() {
	//	if (xhr.readyState === 4) {
	//		wevq.project = JSON.parse(xhr.responseText);
	//		wevq.isLoaded = true;
	//	}
	//}
	}));


