// Core Types for Structura.ai

export type VersionType = 'base' | 'style' | 'lighting' | 'sketch';

export type StyleOption = 'scandi' | 'boho' | 'industrial' | 'modern' | 'minimalist' | 'luxury';

export interface VersionConfig {
  style?: StyleOption;
  brightness?: number;
  warmth?: number;
  timestamp?: number;
  [key: string]: any; // Allow for additional properties
}

export interface Version {
  id: string;
  parentId: string | null;
  projectId?: string;
  name: string;
  type: VersionType;
  imageUrl: string;
  config: VersionConfig;
  createdAt?: Date;
}

export interface Project {
  id: string;
  name: string;
  baseImage: string | null;
  createdAt?: Date;
}

export interface GenerateRequest {
  projectId: string;
  parentVersionId: string;
  config: VersionConfig;
}

export interface GenerateResponse {
  id: string;
  projectId: string;
  parentId: string;
  name: string;
  type: VersionType;
  imageUrl: string;
  configJson: VersionConfig;
  createdAt: string;
}

