export type QueryType = {
  name: string;
};

export interface YamlItemType {
  filename: string;
  value: string;
}

export type { FormSliderListType } from './config';

export type CustomDomainMode = 'cname' | 'certificate';
