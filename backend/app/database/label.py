"""Creation and lookup of individual label definitions."""


import psycopg
import logging
from typing import Dict, Any
from decimal import Decimal

# create a logger to store our log:
logger = logging.getLogger(__name__)

__all__ = ["Label"]

class Label:
  """Methods provided to Database; this class does not create its own pool."""

  def get_label(self, label_ID: int, *, exam_ID: int) -> Dict[str, Any] | None:
    '''
    input: label ID
    output: a dictionary contains label info {'Label_ID': ..., 'title': ..., 'descrption': ..., 'deduction': ...}
    '''
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """SELECT * FROM Label WHERE Label.exam_ID = %s AND Label_ID = %s""",
          (exam_ID, label_ID)
        )
        return self.get_one(cursor)    # primary key search, only one return
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("label not found", extra={"extra": {"label_ID": label_ID}})
      raise

  def add_label(self, title: str, description: str | None, deduction: float | Decimal, *, exam_ID: int) -> int:
    '''
    input: data required to create a new label
    output: the label ID for this newly created label
    '''
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          INSERT INTO Label (exam_ID, title, description, deduction)
          VALUES (%s, %s, %s, %s)
          RETURNING Label_ID
          """,
          (exam_ID, title, description, deduction)
        )
        new_id = self.get_one(cursor)["label_id"]  # only one return, use fetchone
        return new_id
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("error occurs when create new label", extra={"extra": {"title": title}})
      raise
