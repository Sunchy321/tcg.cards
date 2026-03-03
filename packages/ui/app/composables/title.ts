export const useTitle = () => {
  const title = useState('title', () => '');

  useHead({ title });

  return title;
};
