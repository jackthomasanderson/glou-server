export interface Collection {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  userId: string;
  items: { id: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionFormValues {
  name: string;
  color: string;
  icon?: string;
}
