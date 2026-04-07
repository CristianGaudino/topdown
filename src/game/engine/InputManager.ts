export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  dash: boolean;       // Space — consumed on read
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;  // hold to shoot
}

export class InputManager {
  private state: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    dash: false,
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
  };

  private canvas: HTMLCanvasElement;
  private onPause: (() => void) | null = null;

  private keydownHandler: (e: KeyboardEvent) => void;
  private keyupHandler: (e: KeyboardEvent) => void;
  private mousemoveHandler: (e: MouseEvent) => void;
  private mousedownHandler: (e: MouseEvent) => void;
  private mouseupHandler: (e: MouseEvent) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.keydownHandler = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'w': this.state.up = true; break;
        case 's': this.state.down = true; break;
        case 'a': this.state.left = true; break;
        case 'd': this.state.right = true; break;
        case ' ':
          e.preventDefault();
          this.state.dash = true;
          break;
        case 'escape':
          this.onPause?.();
          break;
      }
    };

    this.keyupHandler = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'w': this.state.up = false; break;
        case 's': this.state.down = false; break;
        case 'a': this.state.left = false; break;
        case 'd': this.state.right = false; break;
      }
    };

    this.mousemoveHandler = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      this.state.mouseX = (e.clientX - rect.left) * scaleX;
      this.state.mouseY = (e.clientY - rect.top) * scaleY;
    };

    this.mousedownHandler = (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.state.mouseDown = true;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      this.state.mouseX = (e.clientX - rect.left) * scaleX;
      this.state.mouseY = (e.clientY - rect.top) * scaleY;
    };

    this.mouseupHandler = (e: MouseEvent) => {
      if (e.button === 0) this.state.mouseDown = false;
    };

    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);
    canvas.addEventListener('mousemove', this.mousemoveHandler);
    canvas.addEventListener('mousedown', this.mousedownHandler);
    window.addEventListener('mouseup', this.mouseupHandler);
  }

  setPauseCallback(cb: () => void) {
    this.onPause = cb;
  }

  /** Returns a snapshot; clears one-shot flags (dash) */
  get(): InputState {
    const snap = { ...this.state };
    this.state.dash = false; // consumed
    return snap;
  }

  destroy() {
    window.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('keyup', this.keyupHandler);
    this.canvas.removeEventListener('mousemove', this.mousemoveHandler);
    this.canvas.removeEventListener('mousedown', this.mousedownHandler);
    window.removeEventListener('mouseup', this.mouseupHandler);
  }
}
