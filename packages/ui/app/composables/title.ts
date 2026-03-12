export type TitleInput = string | (() => string) | ComputedRef<string> | Ref<string>;

export const useTitle = (updateFn?: TitleInput) => {
  const title = useState('title', () => '');

  useHead({ title });

  if (updateFn != null) {
    watchEffect(() => {
      title.value = toValue(updateFn);
    });
  }

  return title;
};

export const useTitleType = () => useState<'text' | 'input'>('titleType', () => 'text');
