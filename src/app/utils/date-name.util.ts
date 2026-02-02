import elections from '../../assets/elections.json';

const dateNameByDate: { [date: string]: string } = Object.fromEntries(
  elections.map((e) => [e.date, e.name])
);

export function getDateName(date: string): string {
  return dateNameByDate[date] || date;
}

export { dateNameByDate };
