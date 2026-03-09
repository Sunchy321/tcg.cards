export const useTitle = () => {
  const title = useState('title', () => '');

  useHead({ title });

  return title;
};

export const useTitleType = () => useState<'text' | 'input'>('titleType', () => 'text');
