/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { ReactNode } from 'react';
import type { TableMetaData } from 'src/hooks/apiResources';

export type ColumnKeyTypeType = 'pk' | 'fk' | 'index';

export interface TableTreeNodeData {
  id: string;
  name: string;
  type: 'schema' | 'table' | 'column' | 'empty';
  tableType?: string;
  columnData?: {
    name: string;
    keys?: { type: ColumnKeyTypeType }[];
    type: string;
  };
  children?: TableTreeNodeData[];
  disableCheckbox?: boolean;
}

export interface FetchLazyTablesParams {
  dbId: string | number;
  catalog: string | null | undefined;
  schema: string;
  forceRefresh: boolean;
}

export interface TableExploreTreeProps {
  dbId?: number;
  catalog?: string | null;

  // Selection
  selectedTable?: {
    schema?: string | null;
    tableName?: string | null;
  };
  onSelectTable?: (params: {
    tableName: string;
    schema: string;
    catalog?: string | null;
    dbId?: number;
  }) => void;

  // Extra content next to table name (e.g. warning icon for existing datasets)
  renderTableExtra?: (params: {
    tableName: string;
    schema: string;
    catalog?: string | null;
    dbId?: number;
  }) => ReactNode;

  // Features
  showColumns?: boolean;
  showToolbar?: boolean;
  toolbarViewId?: string;
  allowPinning?: boolean;

  // Pinned items (e.g. for SQL Lab)
  pinnedSchemas?: Set<string>;
  onPinSchema?: (schema: string) => void;
  onUnpinSchema?: (schema: string) => void;
  pinnedTableKeys?: Set<string>;
  onPinTable?: (
    tableName: string,
    schemaName: string,
    catalogName: string | null,
  ) => void;
  onUnpinTable?: (tableName: string, schemaName: string) => void;
  selectStarMap?: Record<string, string>;
  pinnedTables?: Record<string, TableMetaData | undefined>;

  // Multiselect support (for future extension)
  selectionMode?: 'single' | 'multiple';
  selectedTables?: Array<{ schema: string; tableName: string }>;
  onSelectionChange?: (
    selected: Array<{ schema: string; tableName: string }>,
  ) => void;
}
