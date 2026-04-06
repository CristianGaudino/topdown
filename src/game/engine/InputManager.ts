export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
}

export class InputManager {
  private state: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
  };

  private canvas: HTMLCanvasElement;
  private onShoot: ((x: number, y: number) => void) | null = null;

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
      this.state.mouseDown = true;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      this.onShoot?.(x, y);
    };

    this.mouseupHandler = () => {
      this.state.mouseDown = false;
    };

    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);
    canvas.addEventListener('mousemove', this.mousemoveHandler);
    canvas.addEventListener('mousedown', this.mousedownHandler);
    canvas.addEventListener('mouseup', this.mouseupHandler);
  }

  setShootCallback(cb: (x: number, y: number) => void) {
    this.onShoot = cb;
  }

  get(): InputState {
    return this.state;
  }

  destroy() {
    window.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('keyup', this.keyupHandler);
    this.canvas.removeEventListener('mousemove', this.mousemoveHandler);
    this.canvas.removeEventListener('mousedown', this.mousedownHandler);
    this.canvas.removeEventListener('mouseup', this.mouseupHandler);
  }
}
