export interface FileEntry {
  name: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
}

export interface ConnectMsg {
  type: "connect";
  target?: string;
  port?: number;
  password?: string;
}

export interface CreatePtyMsg {
  type: "create_pty";
  cwd?: string;
}

export interface ClosePtyMsg {
  type: "close_pty";
  pty_id: number;
}

export interface StdinMsg {
  type: "stdin";
  data: string;
  pty_id?: number;
}

export interface ResizeMsg {
  type: "resize";
  rows: number;
  cols: number;
  pty_id?: number;
}

export interface ListDirMsg {
  type: "list_dir";
  path: string;
  id?: string;
}

export interface ReadFileMsg {
  type: "read_file";
  path: string;
  id?: string;
}

export interface WriteFileMsg {
  type: "write_file";
  path: string;
  content: string;
  id?: string;
}

export interface CreateDirMsg {
  type: "mkdir";
  path: string;
  id?: string;
}

export interface RenameMsg {
  type: "rename";
  old_path: string;
  new_path: string;
  id?: string;
}

export interface DisconnectMsg {
  type: "disconnect";
}

export type OutgoingMsg =
  | ConnectMsg
  | CreatePtyMsg
  | ClosePtyMsg
  | StdinMsg
  | ResizeMsg
  | ListDirMsg
  | ReadFileMsg
  | WriteFileMsg
  | CreateDirMsg
  | RenameMsg
  | DisconnectMsg;

export interface ConnectedResult {
  type: "connected";
  host: string;
  port: number;
}

export interface StdoutResult {
  type: "stdout";
  data: string;
  pty_id?: number;
}

export interface PtyCreatedResult {
  type: "pty_created";
  pty_id: number;
}

export interface ListDirResult {
  type: "list_dir_result";
  path: string;
  entries: FileEntry[];
  id?: string;
}

export interface ReadFileResult {
  type: "read_file_result";
  path: string;
  content_b64: string;
  id?: string;
}

export interface WriteFileResult {
  type: "write_file_result";
  path: string;
  success: true;
  id?: string;
}

export interface CreateDirResult {
  type: "mkdir_result";
  path: string;
  success: true;
  id?: string;
}

export interface RenameResult {
  type: "rename_result";
  old_path: string;
  new_path: string;
  success: true;
  id?: string;
}

export interface ErrorResult {
  type: "error";
  message: string;
  path?: string;
  id?: string;
}

export type IncomingMsg =
  | ConnectedResult
  | StdoutResult
  | PtyCreatedResult
  | ListDirResult
  | ReadFileResult
  | WriteFileResult
  | CreateDirResult
  | RenameResult
  | ErrorResult;
