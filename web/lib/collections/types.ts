export interface Collection {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  /** #476: who created it (collections are shared); null once their account was deleted. */
  userId: string | null;
  items: { id: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionFormValues {
  name: string;
  color: string;
  icon?: string;
}
