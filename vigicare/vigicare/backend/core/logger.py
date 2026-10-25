import logging
import sys
from logging.handlers import RotatingFileHandler

from .config import settings


LOG_DIR = settings.data_dir / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)


def setup_logger(name: str = "vigicare") -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    fh = RotatingFileHandler(
        LOG_DIR / "vigicare.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    return logger


log = setup_logger()